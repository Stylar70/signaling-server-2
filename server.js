const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET','POST']
  }
});

app.get('/', (req, res) => res.send('Signaling server running'));

// Rooms state
const rooms = {};

io.on('connection', socket => {
  console.log('Connected', socket.id);

  socket.on('join', ({ room, userId, display }) => {
    socket.join(room);
    socket.data.userId = userId;
    socket.data.display = display;

    if (!rooms[room]) rooms[room] = {};
    rooms[room][userId] = { socketId: socket.id, display };

    // Notify others
    socket.to(room).emit('peer-joined', { userId, display });

    // Send existing peers to the new user
    const existing = Object.keys(rooms[room])
      .filter(id => id !== userId)
      .map(id => ({ userId: id, display: rooms[room][id].display }));
    socket.emit('existing-peers', existing);
  });

  socket.on('leave', ({ room, userId }) => {
    socket.leave(room);
    if (rooms[room] && rooms[room][userId]) {
      const display = rooms[room][userId].display;
      delete rooms[room][userId];
      socket.to(room).emit('peer-left', { userId, display });
    }
  });

  socket.on('signal', ({ from, to, data }) => {
    for (const room in rooms) {
      if (rooms[room][to]) {
        const sid = rooms[room][to].socketId;
        io.to(sid).emit('signal', { from, data });
        break;
      }
    }
  });

  socket.on('chatMessage', ({ room, user, text }) => {
    io.to(room).emit('chatMessage', { user, text });
  });

  socket.on('disconnect', () => {
    for (const room in rooms) {
      for (const uid in rooms[room]) {
        if (rooms[room][uid].socketId === socket.id) {
          const display = rooms[room][uid].display;
          delete rooms[room][uid];
          socket.to(room).emit('peer-left', { userId: uid, display });
        }
      }
    }
  });
});

// Render automatically sets PORT env variable
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Signaling server listening on', PORT));
