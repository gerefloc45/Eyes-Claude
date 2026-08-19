const http = require("node:http");

// Fixed (not random) port so the test that spawns this fixture can probe it
// directly, without needing a handle to the child process. This app never
// prints a "Local: http://..." line, so `parseStartupUrl` never matches and
// `startApp`'s wait always times out -- used to verify the timed-out child
// process is actually killed rather than leaked.
const PORT = 47813;

const server = http.createServer((req, res) => {
  res.end("<html><body>silent fake app</body></html>");
});

server.listen(PORT, () => {
  console.log(`silent app listening on port ${PORT} (deliberately not URL-shaped)`);
});
