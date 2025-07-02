let ioInstance;

module.exports = {
  init: (server) => {
    const { Server } = require("socket.io");
    const io = new Server(server, {
      cors: {
        origin: "*", // Adjust this to your app URL in production
        methods: ["GET", "POST"]
      }
    });

    io.on("connection", (socket) => {
      // console.log("⚡ Client connected:", socket.id);

      // Join room based on restaurant ID
      socket.on("joinRestaurantRoom", (restaurantId) => {
        socket.join(`restaurant-${restaurantId}`);
        // console.log(`✅ Socket ${socket.id} joined room restaurant-${restaurantId}`);
      });

      socket.on("disconnect", () => {
        // console.log("🔌 Client disconnected:", socket.id);
      });
    });

    ioInstance = io;
    return io;
  },

  getIO: () => {
    if (!ioInstance) throw new Error("Socket.io not initialized");
    return ioInstance;
  }
};
