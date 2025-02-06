const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

let rooms = {};

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, username }) => {
    socket.join(roomId);
    rooms[socket.id] = { roomId, username };
  });

  socket.on("code-change", ({ roomId, code }) => {
    socket.to(roomId).emit("code-update", code);
  });

  socket.on("cursor-move", ({ roomId, cursorPosition, username }) => {
    socket.to(roomId).emit("cursor-update", {
      userId: socket.id,
      cursorPosition,
      username,
    });
  });

  socket.on("typing", ({ roomId, username }) => {
    socket.to(roomId).emit("user-typing", { userId: socket.id, username });
  });

  socket.on("disconnect", () => {
    const { roomId, username } = rooms[socket.id] || {};
    if (roomId) {
      socket.to(roomId).emit("cursor-update", {
        userId: socket.id,
        cursorPosition: null,
        username,
      });
    }
    delete rooms[socket.id];
  });
});

server.listen(5000, () => console.log("Server running on port 5000"));
