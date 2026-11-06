/* Optional REAL MySQL test. Uses an EMPTY database named queuesmart_a4_test_*.
   Fixture parent tables are a test contract, NOT the teammates' schema. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const request = require('supertest');
if (!/^queuesmart_a4_test_[a-z0-9_]+$/.test(process.env.DB_NAME || '')) {
  throw new Error('DB_NAME must name a dedicated EMPTY queuesmart_a4_test_* database.');
}
const {db} = require('../database');
async function main() {
  const [tables] = await db.query('SHOW TABLES');
  assert.equal(tables.length, 0, 'Refusing to touch a nonempty database');
  const [version] = await db.query('SELECT VERSION() AS version');
  console.log('Database version:', version[0].version);
  for (const sql of [
    'CREATE TABLE Service (service_id INT PRIMARY KEY, service_name VARCHAR(100), expected_duration INT NOT NULL) ENGINE=InnoDB',
    'CREATE TABLE UserCredentials (user_id INT PRIMARY KEY, email VARCHAR(254) UNIQUE) ENGINE=InnoDB',
    "CREATE TABLE History (history_id INT AUTO_INCREMENT PRIMARY KEY,user_id INT,service_id INT,outcome ENUM('active','left','served'),joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,completed_at TIMESTAMP NULL) ENGINE=InnoDB",
    "CREATE TABLE Notification (notification_id INT AUTO_INCREMENT PRIMARY KEY,user_id INT,notification_type VARCHAR(50),message VARCHAR(250),status VARCHAR(20)) ENGINE=InnoDB"
  ]) await db.query(sql);
  const ddl = fs.readFileSync(path.join(__dirname,'../queue_tables.sql'),'utf8').replace(/^--.*$/gm,'');
  for (const sql of ddl.split(';').map(s=>s.trim()).filter(Boolean)) await db.query(sql);
  await db.query("INSERT INTO Service VALUES (1,'Academic Advising',10),(2,'Financial Aid',15)");
  for (let i=1;i<=8;i++) await db.execute('INSERT INTO UserCredentials VALUES (?,?)',[i,`u${i}@example.com`]);
  const app = express();app.use(express.json());
  app.use((req,res,next)=>{req.session={user:{email:req.headers['x-user']||'u1@example.com',role:'Administrator'}};next();});
  app.use('/api',require('../queue'));
  const join=(i,serviceId=1)=>request(app).post('/api/queues/join').set('x-user',`u${i}@example.com`).send({userEmail:`u${i}@example.com`,serviceId});
  const reads=await Promise.all(Array.from({length:8},()=>request(app).get('/api/queues/1')));
  assert.ok(reads.every(r=>r.status===200));
  assert.equal((await db.query('SELECT * FROM Queue'))[0].length,0);
  const joined=await Promise.all([1,2,3,4].map(i=>join(i)));
  assert.ok(joined.every(r=>r.status===201));
  assert.deepEqual(joined.map(r=>r.body.entry.position).sort(),[1,2,3,4]);
  const duplicate=await Promise.all([join(5,1),join(5,2)]);
  assert.deepEqual(duplicate.map(r=>r.status).sort(),[201,409]);
  assert.equal((await db.query("SELECT * FROM QueueEntry WHERE status='waiting' AND user_id=5"))[0].length,1);
  const status=await request(app).get('/api/queues/user/u1@example.com');
  assert.equal(status.body.entry.serviceId,1);
  assert.equal((await request(app).delete('/api/queues/1/leave').send({userEmail:'u1@example.com'})).status,200);
  const served=await Promise.all([1,2].map(()=>request(app).post('/api/queues/1/next')));
  assert.ok(served.every(r=>r.status===200));assert.notEqual(served[0].body.served.id,served[1].body.served.id);
  const [waiting]=await db.query("SELECT position FROM QueueEntry WHERE status='waiting' AND queue_id=(SELECT queue_id FROM Queue WHERE service_id=1 AND status='open') ORDER BY position");
  assert.deepEqual(waiting.map(e=>e.position),waiting.map((_,i)=>i+1));
  const view=await request(app).get('/api/queues/1');
  assert.deepEqual(view.body.queue.map(e=>e.estimatedWait),waiting.map((_,i)=>i*10));
  assert.equal((await db.query("SELECT * FROM History WHERE outcome='left'"))[0].length,1);
  assert.equal((await db.query("SELECT * FROM History WHERE outcome='served'"))[0].length,2);
  assert.ok((await db.query('SELECT * FROM Notification'))[0].length>=5);
  // Force a downstream failure to prove QueueEntry/History rollback on the real engine.
  await db.query('RENAME TABLE Notification TO Notification_test_unavailable');
  assert.equal((await join(8)).status,500);
  assert.equal((await db.query('SELECT * FROM QueueEntry WHERE user_id=8'))[0].length,0);
  assert.equal((await db.query('SELECT * FROM History WHERE user_id=8'))[0].length,0);
  await db.query('RENAME TABLE Notification_test_unavailable TO Notification');
  console.log('PASS: real SQL persistence, concurrent joins/serves, positions, history, notifications, rollback.');
  console.log('Fixture data retained for inspection; use a new empty test database for another run.');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.end());
