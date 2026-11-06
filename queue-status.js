// Queue-only views. Keep authentication and history/notification ownership unchanged.
(() => {
  async function read(path) {
    const response = await fetch(path);
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Could not retrieve queue data.');
    return result;
  }
  function text(tag, value) {
    const element = document.createElement(tag);
    element.textContent = value;
    return element;
  }
  async function refresh() {
    const summary = document.querySelector('[data-live-queue]');
    const serviceList = document.getElementById('services');
    const statusTable = document.getElementById('admin-status');
    try {
      const session = await read('/api/session');
      if (!session.authenticated) throw new Error('Please log in to view your queue.');
      if (statusTable && session.user.role !== 'Administrator') throw new Error('Administrator access is required.');
      if (summary) {
        const response = await fetch('/api/queues/user/' + encodeURIComponent(session.user.email));
        const data = await response.json();
        if (response.status === 404) summary.replaceChildren(text('p', 'You are not currently in a queue.'));
        else {
          if (!response.ok) throw new Error(data.message || 'Could not retrieve your queue.');
          summary.replaceChildren(...[
            `Service: ${data.service.name}`, `Position: ${data.entry.position}`,
            `Estimated wait: ${data.entry.estimatedWait} minutes`
          ].map(value => text('p', value)));
        }
      }
      if (serviceList || statusTable) {
        const { services } = await read('/api/queues/services');
        if (serviceList) serviceList.replaceChildren(...services.map(service => text('li', `${service.name}: ${service.waiting} waiting; estimated wait ${service.estimatedWait} minutes`)));
        if (statusTable) statusTable.replaceChildren(...services.map(service => {
          const row = document.createElement('tr');
          [service.name, service.waiting, `${service.estimatedWait} minutes`, service.waiting ? 'Waiting' : 'Empty'].forEach(value => row.append(text('td', value)));
          return row;
        }));
      }
      document.getElementById('feedback').textContent = '';
    } catch (error) {
      if (summary) summary.replaceChildren(text('p', 'Queue data is unavailable.'));
      if (serviceList) serviceList.replaceChildren();
      if (statusTable) statusTable.replaceChildren();
      document.getElementById('feedback').textContent = error.message;
    }
  }
  refresh();
  setInterval(refresh, 15000);
})();
