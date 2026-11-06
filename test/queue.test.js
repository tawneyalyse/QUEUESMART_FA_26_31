const express = require('express');
const request = require('supertest');
const mockExecute = jest.fn();
const mockClient = { execute: mockExecute, beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn() };
const mockGetConnection = jest.fn();
jest.mock('../database', () => ({ db: { execute: (...args) => mockExecute(...args), getConnection: (...args) => mockGetConnection(...args) } }));
const router = require('../queue');
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  if (!req.headers['x-anonymous']) req.session = {user: {email: req.headers['x-user'] || 'a@example.com', role: req.headers['x-role'] || 'Administrator'}};
  next();
});
app.use('/api', router);
const service = {service_id: 1, service_name: 'Academic Advising', expected_duration: 10};
let entries, notes, histories, queueExists, serviceExists, userExists, fail;
const row = (id, email, position) => ({entry_id:id,user_id:id,email,position,queue_id:7,join_time:'2026-11-05T12:00:00Z',status:'waiting'});
async function execute(sql, params = []) {
  if (fail && sql.includes(fail)) throw new Error('injected database failure');
  if (sql.startsWith('SELECT * FROM Service')) return [[...(serviceExists ? [service] : [])]];
  if (sql.startsWith('SELECT user_id')) return [userExists ? [{user_id:9}] : []];
  if (sql.startsWith('SELECT * FROM Queue WHERE')) return [queueExists ? [{queue_id:7,service_id:1}] : []];
  if (sql.startsWith('INSERT INTO Queue (')) {queueExists=true;return [{insertId:7}];}
  if (sql.startsWith('SELECT entry_id')) return [entries.filter(e=>e.user_id===params[0] && e.status==='waiting')];
  if (sql.includes('SELECT qe.*, q.service_id')) return [entries.filter(e=>e.email===params[0] && e.status==='waiting').map(e=>({...e,...service}))];
  if (sql.includes('SELECT qe.entry_id, qe.user_id\n')) return [entries.filter(e=>e.email===params[1] && e.status==='waiting')];
  if (sql.includes('FROM QueueEntry qe')) return [entries.filter(e=>e.status==='waiting').map(e=>({...e})).sort((a,b)=>a.position-b.position)];
  if (sql.startsWith('INSERT INTO QueueEntry')) {entries.push(row(9,'a@example.com',params[2]));return [{insertId:9}];}
  if (sql.startsWith('INSERT INTO History')) {histories.push(params);return [{insertId:1}];}
  if (sql.includes('UPDATE History')) {histories.push([sql,...params]);return [{affectedRows:1}];}
  if (sql.includes('INSERT INTO Notification')) {notes.push(params);return [{insertId:1}];}
  if (sql.startsWith('SELECT join_time')) return [[{join_time:entries.at(-1).join_time}]];
  if (sql.startsWith('UPDATE QueueEntry SET position')) {entries.find(e=>e.entry_id===params[1]).position=params[0];return [{}];}
  if (sql.startsWith('UPDATE QueueEntry SET status')) {entries.find(e=>e.entry_id===params[0]).status=sql.includes('canceled')?'canceled':'served';return [{}];}
  throw new Error('Unexpected query: '+sql);
}
beforeEach(()=>{
  jest.resetAllMocks(); entries=[];notes=[];histories=[];queueExists=true;serviceExists=true;userExists=true;fail=null;
  mockGetConnection.mockResolvedValue(mockClient);mockExecute.mockImplementation(execute);
});
const join = (body={userEmail:'a@example.com',serviceId:'advising'}) => request(app).post('/api/queues/join').send(body);
const leave = (email='a@example.com') => request(app).delete('/api/queues/1/leave').send({userEmail:email});
const serve = () => request(app).post('/api/queues/1/next');
test('requires login and admin role, and checks email ownership',async()=>{
  expect((await request(app).get('/api/queues/services').set('x-anonymous','1')).status).toBe(401);
  expect((await request(app).post('/api/queues/1/next').set('x-role','Student')).status).toBe(403);
  expect((await join({userEmail:'other@example.com',serviceId:1})).status).toBe(403);
  expect((await request(app).get('/api/queues/user/other@example.com')).status).toBe(403);
});
test('read routes return empty queues without creating rows',async()=>{
  queueExists=false;
  expect((await request(app).get('/api/queues/services')).body.services[0]).toMatchObject({waiting:0,estimatedWait:0});
  expect((await request(app).get('/api/queues/1')).body.queue).toEqual([]);
  expect((await request(app).get('/api/queues/1/wait-time')).body).toMatchObject({position:1,estimatedWait:0});
  expect(mockExecute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
});
test('join persists entry, history, notification and commits after writes',async()=>{
  queueExists=false;
  entries=[row(1,'b@example.com',1),row(2,'c@example.com',2)];
  const res=await join();
  expect(res.status).toBe(201);expect(res.body.entry).toMatchObject({position:3,estimatedWait:20,serviceId:1});
  expect(histories).toEqual([[9,1]]);expect(notes[0][1]).toBe('queue_joined');
  expect(mockClient.commit).toHaveBeenCalledTimes(1);expect(mockClient.rollback).not.toHaveBeenCalled();expect(mockClient.release).toHaveBeenCalledTimes(1);
  expect(mockExecute.mock.calls.some(([sql])=>sql.includes('Service WHERE service_name = ? FOR UPDATE'))).toBe(true);
  expect(mockExecute.mock.calls.some(([sql])=>sql.includes('UserCredentials WHERE email = ? FOR UPDATE'))).toBe(true);
});
test('accepts numeric service ID and normalizes email',async()=>{
  const r=await join({userEmail:' A@Example.com ',serviceId:1});expect(r.status).toBe(201);expect(r.body.entry.userEmail).toBe('a@example.com');
});
test.each([{}, {userEmail:'invalid',serviceId:1},{userEmail:42,serviceId:1}])('rejects invalid join %j',async(body)=>{
  expect((await join(body)).status).toBe(400);expect(mockClient.rollback).toHaveBeenCalled();
});
test.each(['missing',{},'constructor'])('unknown/invalid service %j',async(serviceId)=>{
  expect((await join({userEmail:'a@example.com',serviceId})).status).toBe(404);
});
test('rejects missing service/user and active user in another queue',async()=>{
  serviceExists=false;expect((await join()).status).toBe(404);serviceExists=true;
  userExists=false;expect((await join()).status).toBe(404);userExists=true;
  entries=[{...row(9,'a@example.com',1),queue_id:99}];expect((await join()).status).toBe(409);
});
test('user lookup includes service IDs needed to leave after refresh',async()=>{
  entries=[row(9,'a@example.com',3)];
  const r=await request(app).get('/api/queues/user/a@example.com');
  expect(r.body.service.id).toBe(1);expect(r.body.entry).toMatchObject({serviceId:1,position:3,estimatedWait:20});
  expect((await request(app).get('/api/queues/user/invalid')).status).toBe(400);
  entries=[];expect((await request(app).get('/api/queues/user/a@example.com')).status).toBe(404);
});
test('leave cancels exact entry, retains history, compacts positions, notifies threshold crossing only',async()=>{
  entries=[row(9,'a@example.com',1),row(2,'b@example.com',2),row(3,'c@example.com',3),row(4,'d@example.com',4)];
  const r=await leave();expect(r.status).toBe(200);
  expect(entries[0].status).toBe('canceled');expect(r.body.queue.map(e=>[e.position,e.estimatedWait])).toEqual([[1,0],[2,10],[3,20]]);
  expect(histories[0][0]).toContain("outcome = 'left'");expect(notes.map(n=>n[0])).toEqual([3]);expect(mockClient.commit).toHaveBeenCalled();
  expect((await leave()).status).toBe(404);
});
test('serves FIFO and excludes canceled/served entries; alerts once on crossing',async()=>{
  entries=[row(1,'a@example.com',1),row(2,'b@example.com',2),row(3,'c@example.com',3),{...row(4,'d@example.com',1),status:'canceled'}];
  const r=await serve();expect(r.status).toBe(200);expect(r.body.served.id).toBe(1);expect(entries[0].status).toBe('served');expect(histories[0][0]).toContain("outcome = 'served'");
  expect(r.body.queue.map(e=>e.estimatedWait)).toEqual([0,10]);await serve();expect(notes.map(n=>n[0])).toEqual([3]);await serve();expect((await serve()).status).toBe(404);
});
test('mutation validation failures do not commit',async()=>{
  expect((await leave('bad')).status).toBe(400);serviceExists=false;expect((await leave()).status).toBe(404);expect((await serve()).status).toBe(404);expect(mockClient.commit).not.toHaveBeenCalled();
});
test('wait endpoints handle existing user, new arrival, unknown and invalid email',async()=>{
  entries=[row(1,'a@example.com',1),row(2,'b@example.com',2)];
  expect((await request(app).get('/api/queues/1/wait-time')).body.estimatedWait).toBe(20);
  expect((await request(app).get('/api/queues/1/wait-time?userEmail=A@example.com')).body.estimatedWait).toBe(0);
  expect((await request(app).get('/api/queues/1/wait-time?userEmail=bad')).status).toBe(400);
  entries=[];expect((await request(app).get('/api/queues/1/wait-time?userEmail=a@example.com')).status).toBe(404);
  serviceExists=false;expect((await request(app).get('/api/queues/1/wait-time')).status).toBe(404);expect((await request(app).get('/api/queues/1')).status).toBe(404);
});
test.each(['/queues/services','/queues/user/a@example.com','/queues/1','/queues/1/wait-time'])('returns controlled read error %s',async(path)=>{
  mockExecute.mockRejectedValue(new Error('offline'));expect((await request(app).get('/api'+path)).status).toBe(500);
});
test.each(['join','leave','serve'])('pool acquisition failure is handled for %s',async(action)=>{
  mockGetConnection.mockRejectedValue(new Error('offline'));
  expect((await ({join,leave,serve}[action])()).status).toBe(500);expect(mockClient.release).not.toHaveBeenCalled();
});
test.each(['join','leave','serve'])('rolls back failed %s without committing',async(action)=>{
  entries=action==='join'?[]:[row(9,'a@example.com',1)];fail='History';
  expect((await ({join,leave,serve}[action])()).status).toBe(500);expect(mockClient.rollback).toHaveBeenCalled();expect(mockClient.commit).not.toHaveBeenCalled();expect(mockClient.release).toHaveBeenCalled();
});
test('failed commit is not reported as success',async()=>{
  mockClient.commit.mockRejectedValue(new Error('commit failed'));expect((await join()).status).toBe(500);expect(mockClient.rollback).toHaveBeenCalled();expect(mockClient.release).toHaveBeenCalled();
});

test('database uniqueness violation is a conflict and rolls back',async()=>{
  mockExecute.mockRejectedValue(Object.assign(new Error('duplicate'),{code:'ER_DUP_ENTRY'}));
  expect((await join()).status).toBe(409);expect(mockClient.rollback).toHaveBeenCalled();
});

test('authorization covers trailing slashes and conflicting email sources',async()=>{
  expect((await request(app).post('/api/queues/1/next/').set('x-role','Student')).status).toBe(403);
  expect((await request(app).get('/api/queues/1/').set('x-role','Student')).status).toBe(403);
  expect((await request(app).get('/api/queues/user/other@example.com').send({userEmail:'a@example.com'})).status).toBe(403);
});
