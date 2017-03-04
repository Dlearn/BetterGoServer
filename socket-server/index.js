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

var soloIndex;
var soloPlayers = [];

var questIndex;
var questPlayers = [];

var fightIndex;
var fightPlayers = [];

var objCoodinates = { x: 54, y: 54 }
var monsterHealth = 100;

io.on('connection', function (socket) {
  var addedUser = false;

  // when the client emits 'add user', this listens and executes
  socket.on('add user', function () {
    if (addedUser) return;

    addedUser = true;
    // we store the username in the socket session for this client
    socket.username = 'user'+numUsers.toString();
    console.log('User ' + socket.username + ' connected.');
    ++numUsers;

    // Add to room 'solo'
    socket.join('solo');
    soloPlayers.push({
      username: socket.username,
      socketid: socket.id 
    });

    // This socket is logged in.
    socket.emit('login', {
      numUsers: numUsers
    });

    // echo globally (all clients) that a person has connected
    socket.broadcast.emit('user joined', {
      socketid: socket.id,
      username: socket.username,
      numUsers: numUsers
    });
  });

  // Client queries server who is solo
  socket.on('who is solo', function () {
    socket.emit('solo players', soloPlayers);
  });

  socket.on('invite', function (invitee_username) {
    // Invite a user into a room.
    // Automatically joins the room and causes target user to join a room
    console.log(socket.username + ' has invited ' + invitee_username + ' to a party!');
    var invitee_id = soloPlayers.getSocketObj(invitee_username).socketid;
    if (invitee_id)
    {
      // Inviter forms a party
      socket.emit('form party', {
        inviter: socket.username,
        invitee: invitee_username,
        obj: objCoodinates
      });
      
      // Invitee forms a party
      socket.broadcast.to(invitee_id).emit('form party', {
        inviter: socket.username,
        invitee: invitee_username
      });
    }
  });

  socket.on('formed party', function () {
    // TODO: Remove consolelog
    console.log(socket.username + ' has joined a party!');
    soloPlayers.removeSocketObj(socket.username);
    questPlayers.push({
      username: socket.username,
      socketid: socket.id,
      arrived_at_obj: false
    });
    socket.leave('solo');
    socket.join('quest');
  });

  socket.on('cur coord', function (cur_coord) {
    var x_sqr = (objCoodinates.x - cur_coord.x) * (objCoodinates.x - cur_coord.x);
    var y_sqr = (objCoodinates.y - cur_coord.y) * (objCoodinates.y - cur_coord.y);
    var distance = Math.sqrt(x_sqr * x_sqr + y_sqr * y_sqr);
    if (distance < 1) 
    {
      console.log(socket.username + ' is close enough!');
      questPlayers.getSocketObj()
    }
  });

  // when the user disconnects.. perform this
  socket.on('disconnect', function () {
    if (addedUser) {
      console.log('User ' + socket.username + ' discconnected.');
      --numUsers;

      // TODO: Check how to handle disconnections
      soloPlayers.removeSocketObj(socket.username);

      // echo globally that this client has left
      socket.broadcast.emit('user left', {
        username: socket.username,
        numUsers: numUsers
      });
    }
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
      } 
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
      if (this[i].username === username) 
      {
        // TODO: REMOVE CONSOLELOG
        console.log(username + ' removed.');
        this.splice(i, 1);
      }
   }
}
