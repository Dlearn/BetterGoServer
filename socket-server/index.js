// Setup basic express server
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('..')(server);
var port = process.env.PORT || 3000;

server.listen(port, function () {
  console.log('Server listening at port %d', port);
});

// Routing
app.use(express.static(__dirname + '/public'));

var numUsers = 0;
var userList = [];
var soloPlayers = [];
var questRooms = [
  { room: 'qroom1', destx: 5, desty: 5, occupied: false },
  { room: 'qroom2', destx: 5, desty: 5, occupied: false },
  { room: 'qroom3', destx: 5, desty: 5, occupied: false },
  { room: 'qroom4', destx: 5, desty: 5, occupied: false },
  { room: 'qroom5', destx: 5, desty: 5, occupied: false }
];

// TODO: Fight rooms
var fightPlayers = [];
var monsterHealth = 100;

io.on('connection', function (socket) {
  console.log('User connected.');
  var addedUser = false;

  // when the client emits 'add user', this listens and executes
  socket.on('add user', function () {
    if (addedUser) return;

    addedUser = true;
    // we store the username in the socket session for this client
    socket.username = 'user'+numUsers.toString();
    ++numUsers;
    socket.emit('login', {
      numUsers: numUsers
    });

    socket.join('solo');
    // Add the new user to the list of users
    userList.push({
      username: socket.username,
      socketid: socket.id,
      room: 'solo'
    });
    soloPlayers.push({
      username: socket.username,
      socketid: socket.id 
    });

    // echo globally (all clients) that a person has connected
    socket.broadcast.emit('user joined', {
      socketid: socket.id,
      username: socket.username,
      numUsers: numUsers
    });
  });

  // when the user disconnects.. perform this
  socket.on('disconnect', function () {
    if (addedUser) {
      --numUsers;

      userList.removeSocketObj(socket.username);
      soloPlayers.removeSocketObj(socket.username);

      // echo globally that this client has left
      socket.broadcast.emit('user left', {
        username: socket.username,
        numUsers: numUsers
      });
    }
  });

  socket.on('change room to', function (room) {
    var socketcurrentroom = userList.getSocketObj(socket.username).room;
    socket.leave(socketcurrentroom);
    socket.join(room);
    //socket.emit('console', 'CHANGED ROOM');

    io.in(socketcurrentroom).emit('new message', 'NEW QUEST')
    // TODO: Start checking coordinates
  });

  // when the client emits 'new message', this listens and executes
  socket.on('new message', function (data) {

    data = data.split(/[ ]+/);

    if (data[0] === 'w')
    {
      // Whisper someone
      var whispereeUsername = data[1];
      var message = data[2];
      var whispereeId = userList.getSocketObj(whispereeUsername).socketid;
      if (whispereeId)
      {
        // Show message in own chat window
        socket.emit('new message', {
          username: socket.username + ' to ' + whispereeUsername,
          message: message
        });

        // Show message in target chat window
        socket.broadcast.to(whispereeId).emit('new message', {
          username: socket.username + ' to ' + whispereeUsername,
          message: message
        });
      } else {}
      
    } else if (data[0] === 'invite')
    {
      // Invite a user into a room.
      // Automatically joins the room and causes target user to join a room
      var inviteeUsername = data[1];
      var inviteeid = soloPlayers.getSocketObj(inviteeUsername).socketid;
      if (inviteeid)
      {
        socket.leave('solo');
        var freeRoom = questRooms.getFreeRoom();
        freeRoom.occupied = true;
        socket.join(freeRoom);
        socket.broadcast.to(inviteeid).emit('invite to room', freeRoom);
      } else {}
    } else if (data[0] === 'getSolo')
    {
      //socket.emit('console', soloPlayers);
      soloPlayers.forEach(function (user)
      {
        io.emit('new message', {
          username: user.socketid,
          message: user.username
        });
      });
    } else if (data[0] === 'attack' && monsterHealth > 0) 
    {
      monsterHealth--;
      io.emit('new message', {
        username: socket.username,
        message: monsterHealth
      });
    } else
    {
      // we tell the client to execute 'new message'
      io.emit('new message', {
        username: socket.username,
        message: data
      });
    }
  });
});

Array.prototype.getSocketObj = function (username) {
   for (i in this) {
      if (this[i].username == username) return this[i];
   }
   return 0;
}

Array.prototype.removeSocketObj = function (username) {
   for (var i = this.length; i--;) {
      if (this[i].username == username) 
      {
        //console.log(username + 'removed.');
        this.splice(i, 1);
      }
   }
}

Array.prototype.getFreeRoom = function () {
  for (i in this) {
    if (this[i].occupied === false) return this[i];
  }
  return 0;
}