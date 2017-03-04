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

var soloPlayers = [];
var questPlayers = [];
var fightPlayers = [];
fightPlayers.push(0);

var objCoodinates = { x: 51, y: 51 }

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

    var questPlayer = questPlayers.getSocketObj(socket.username);
    var fightPlayer = fightPlayers.getSocketObj(socket.username);
    if (questPlayer)
    {
      console.log('questPlayer' + socket.username + ' reconnected');
      questPlayer.socketid = socket.id;
      questPlayer.connected = true;
    } else if (fightPlayer)
    {
      console.log('fightPlayer' + socket.username + ' reconnected');
      fightPlayer.socketid = socket.id;
      fightPlayer.connected = true;
    } else
    {
      // Add to room 'solo'
      socket.join('solo');
      socket.index = soloPlayers.length;
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
        username: socket.username,
        socketid: socket.id,
        numUsers: numUsers
      });
    }
  });

  // Client queries server who is solo
  socket.on('who is solo', function () {
    socket.emit('solo players', soloPlayers);
  });

  socket.on('invite', function (invitee_username) {
    if (socket.username === invitee_username) return;
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

    // Remove from soloPlayers
    soloPlayers.removeSocketObj(socket.username);

    // Add to questPlayers
    socket.index = questPlayers.length;
    questPlayers.push({
      username: socket.username,
      socketid: socket.id,
      connected: true,
      arrived_at_obj: false
    });

    socket.leave('solo');
    socket.join('quest');
  });

  socket.on('cur coord', function (cur_coord) {
    // Disconnection policy
    if (questPlayers.length !== 2) 
    {
      // console.log('Party member disconnected. Disbanding quest.');
      // socket.emit('quest disband');
      console.log('waiting for party to reconnect...');
    } else
    {
      var x_sqr = (objCoodinates.x - cur_coord.x) * (objCoodinates.x - cur_coord.x);
      var y_sqr = (objCoodinates.y - cur_coord.y) * (objCoodinates.y - cur_coord.y);
      var distance = Math.sqrt(x_sqr * x_sqr + y_sqr * y_sqr);
      console.log(socket.username + ': ' + cur_coord.x + ', ' + cur_coord.y + ' has distance: ' + distance);
      if (distance <= 1) 
      {
        questPlayers[socket.index].arrived_at_obj = true;
        var allArrived = questPlayers[0].arrived_at_obj && questPlayers[1].arrived_at_obj;
        if (allArrived) 
        {
          console.log('Party has arrived at the objective and will fight boss!');
          io.to('quest').emit('party on obj');
        }
      } else
      {
        questPlayers[socket.index].arrived_at_obj = false;
      }
    }
  });

  socket.on('fighting boss', function () {
    // Remove from questPlayers
    questPlayers.removeSocketObj(socket.username);

    fightPlayers[0] = 100;
    // Add to fightPlayers
    socket.index = fightPlayers.length;
    fightPlayers.push({
      username: socket.username,
      socketid: socket.id,
      connected: true,
    });
    socket.leave('quest');
    socket.join('fight');
  });

  socket.on('attack', function (damage) {
    // Disconnection policy
    if (fightPlayers.length !== 3) 
    {
      // console.log('Party member disconnected. Disbanding fight.');
      // socket.emit('fight disband');
      console.log('waiting for party to reconnect...');
    } else if(socket.rooms['fight']) 
    {
      fightPlayers[0] -= damage;
      fightPlayers[0] = Math.max(0, fightPlayers[0]);
      console.log(socket.username + ' hit the boss for ' + damage + '. The boss has ' + fightPlayers[0] + ' left.');
      
      io.to('fight').emit('boss hit', {
        username: socket.username,
        message: ' hit the boss for ' + damage + '. The boss has ' + fightPlayers[0] + ' left.'
      });
      if (fightPlayers[0] <= 0) io.to('fight').emit('boss defeated');
    } 
    // TODO: REMOVE REDUNDANT ON APP
    else socket.emit('new message', {
      username: socket.username,
      message: 'But you aren\'t fighting anything'
    });
  });

  socket.on('looking for party', function () {
    socket.leave('quest');
    questPlayers.removeSocketObj(socket.username);
    socket.leave('fight');
    fightPlayers.removeSocketObj(socket.username);

    socket.join('solo');
    socket.index = soloPlayers.length;
    soloPlayers.push({
      username: socket.username,
      socketid: socket.id,
    });
  });

  // when the user disconnects.. perform this
  socket.on('disconnect', function () {
    if (addedUser) {
      console.log('User ' + socket.username + ' discconnected.');
      --numUsers;

      soloPlayers.removeSocketObj(socket.username);
      if(socket.rooms['quest']) questPlayers.getSocketObj(socket.username).connected = false;
      else if(socket.rooms['fight']) fightPlayers.getSocketObj(socket.username).connected = false;

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
    }
    else if (data[0] === 'getSolo') socket.emit('console', soloPlayers);
    else if (data[0] === 'getQuest') socket.emit('console', questPlayers);
    else if (data[0] === 'getFight') socket.emit('console', fightPlayers);
    else if (data[0] === 'rooms') socket.emit('console', socket.rooms);
    else
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
      if (this[i].username === username) this.splice(i, 1);
   }
}