// server.js
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
app.get('/', (req, res) => res.send('Voice Chat Signaling Server Running'));

// Create HTTP server and attach Socket.IO
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Keep track of rooms and participants
const rooms = {};

io.on('connection', socket => {
  console.log(`[CONNECT] Socket ${socket.id} connected`);

  // --- JOIN ROOM ---
  socket.on('join', ({ room, userId, display }) => {
    socket.join(room);
    socket.data.userId = userId;
    socket.data.display = display;

    if (!rooms[room]) rooms[room] = {};
    rooms[room][userId] = { socketId: socket.id, display };

    console.log(`[JOIN] ${display} (${userId}) joined ${room}`);

    // Notify others
    socket.to(room).emit('peer-joined', { userId, display });

    // Send existing peers to new user
    const existing = Object.keys(rooms[room])
      .filter(id => id !== userId)
      .map(id => ({ userId: id, display: rooms[room][id].display }));
    socket.emit('existing-peers', existing);
  });

  // --- LEAVE ROOM ---
  socket.on('leave', ({ room, userId }) => {
    socket.leave(room);
    if (rooms[room] && rooms[room][userId]) {
      const display = rooms[room][userId].display;
      delete rooms[room][userId];
      console.log(`[LEAVE] ${display} (${userId}) left ${room}`);
      socket.to(room).emit('peer-left', { userId, display });
    }
  });

  // --- SIGNALING ---
  socket.on('signal', ({ from, to, data }) => {
    // Find target socket
    for (const room in rooms) {
      if (rooms[room][to]) {
        const sid = rooms[room][to].socketId;
        io.to(sid).emit('signal', { from, data });
        break;
      }
    }
  });

  // --- CHAT ---
  socket.on('chatMessage', ({ room, user, text }) => {
    io.to(room).emit('chatMessage', { user, text });
  });

  // --- DISCONNECT ---
  socket.on('disconnect', () => {
    console.log(`[DISCONNECT] Socket ${socket.id} disconnected`);
    for (const room in rooms) {
      for (const uid in rooms[room]) {
        if (rooms[room][uid].socketId === socket.id) {
          const display = rooms[room][uid].display;
          delete rooms[room][uid];
          console.log(`[DISCONNECT-ROOM] ${display} (${uid}) removed from ${room}`);
          socket.to(room).emit('peer-left', { userId: uid, display });
        }
      }
    }
  });
});

// Listen on Render port or fallback
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Signaling server listening on port ${PORT}`));


