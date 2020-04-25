const express = require('express');
const socketIO = require('socket.io');
const http = require('http');
const path = require('path');
const SocketRoutesConfig = require('./config/SocketRoutesConfig');

const app = express();
app.use(express.static('public'));

app.get('/', (request, response) => {
    response.sendFile('./views/index.html', { root: __dirname });
});

const httpServer = http.createServer(app);

httpServer.listen(process.env.PORT || 3000, () => {
    console.log('http server is listen!');
});

const io = socketIO(httpServer);

io.on('connection', socket => {
    console.log('socket on connection socket :: ', socket.id);
    SocketRoutesConfig.init(socket, io);
});

