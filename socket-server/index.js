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
      arrived_at_obj: false
    });

    socket.leave('solo');
    socket.join('quest');
  });

  socket.on('cur coord', function (cur_coord) {
    var x_sqr = (objCoodinates.x - cur_coord.x) * (objCoodinates.x - cur_coord.x);
    var y_sqr = (objCoodinates.y - cur_coord.y) * (objCoodinates.y - cur_coord.y);
    var distance = Math.sqrt(x_sqr * x_sqr + y_sqr * y_sqr);
    //console.log(socket.username + ': ' + cur_coord.x + ', ' + cur_coord.y + ' has distance: ' + distance);
    if (distance <= 1) 
    {
      //console.log(socket.username + ' is close enough!');
      questPlayers[socket.index].arrived_at_obj = true;
      if (partyAtObj(questPlayers)) 
      {
        console.log('BOTH PLAYERS ARE HERE!');
        io.to('quest').emit('party on obj');
      }
    } else
    {
      questPlayers[socket.index].arrived_at_obj = false;
    }
  });

  socket.on('fighting boss', function () {
    // TODO: Remove consolelog
    console.log(socket.username + ' is fighting a boss!');

    // Remove from questPlayers
    questPlayers.removeSocketObj(socket.username);

    fightPlayers[0] = 100;
    // Add to fightPlayers
    socket.index = fightPlayers.length;
    fightPlayers.push({
      username: socket.username,
      socketid: socket.id
    });
    socket.leave('quest');
    socket.join('fight');
  });

  socket.on('attack', function (damage) {
    if(socket.rooms['fight']) 
    {
      fightPlayers[0] -= damage;
      fightPlayers[0] = Math.max(0, fightPlayers[0]);
      console.log(socket.username + ' hit the boss for ' + damage + '. The boss has ' + fightPlayers[0] + ' left.');
      if (fightPlayers[0] > 0)
      {
        var comp_message = ' hit the boss for ' + damage + '. The boss has ' + fightPlayers[0] + ' left.';
        io.to('fight').emit('boss hit', {
          username: socket.username,
          message: comp_message
        });
      } else
      {
        io.to('fight').emit('boss defeated');
      }
    } 
    // TODO: REMOVE REDUNDANT
    else socket.emit('new message', {
      username: socket.username,
      message: 'But you aren\'t fighting anything'
    });
  });

  // when the user disconnects.. perform this
  socket.on('disconnect', function () {
    if (addedUser) {
      console.log('User ' + socket.username + ' discconnected.');
      --numUsers;

      // TODO: Check how to handle disconnections
      soloPlayers.removeSocketObj(socket.username);
      questPlayers.removeSocketObj(socket.username);
      fightPlayers.removeSocketObj(socket.username);

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

function partyAtObj(questPlayers)
{
  questPlayers.forEach(function (player)
    {
      if (!player.arrived_at_obj) return false;
    });
  return true;
}