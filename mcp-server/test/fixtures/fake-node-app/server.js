const http = require("node:http");

const server = http.createServer((req, res) => {
  res.end("<html><body>fake app</body></html>");
});

server.listen(0, () => {
  const port = server.address().port;
  console.log(`Local: http://localhost:${port}/`);
});
