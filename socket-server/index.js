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
  socket.on('add user', function (data) {
    if (addedUser) return;
    addedUser = true;

    // we store the username in the socket session for this client
    if (data) 
    {
      var repeatedSolo = soloPlayers.getSocketObj(data.username);
      var repeatedQuest = questPlayers.getSocketObj(data.username);
      var repeatedFight = fightPlayers.getSocketObj(data.username);

      // No repeated usernames
      if (repeatedSolo || repeatedQuest || repeatedFight) return;
      socket.username = data.username;
    }
    else socket.username = 'DesktopUser'+numUsers.toString();

    console.log('User ' + socket.username + ' connected.');
    numUsers++;
    
    socket.join('solo');
    socket.index = soloPlayers.length;
    soloPlayers.push({
      username: socket.username,
      socketid: socket.id
    });

    // Show this client the welcome message
    socket.emit('login', {
      username: socket.username,
    });

    // echo globally (all clients) that a person has connected
    socket.broadcast.emit('user joined', {
      username: socket.username,
    });
  });

  // Client queries server who is solo
  socket.on('get solos', function () {
    var data = {};
    for (var i=0; i<soloPlayers.length; i++)
    {
      data['key'+i] = soloPlayers[i].username;
    }
    socket.emit('solo players', data);
  });

  socket.on('invite', function (data) {
    if (socket.username === data.username) return;
    // Invite a user into a room.
    // Automatically joins the room and causes target user to join a room
    var invitee_id = soloPlayers.getSocketObj(data.username).socketid;
    if (invitee_id)
    {
      // Inviter forms a party
      socket.emit('form party', {
        inviter: socket.username,
        invitee: data.username,
        // TODO: OBJECTIVE COORDS
        //obj: objCoodinates
      });
      
      // Invitee forms a party
      socket.broadcast.to(invitee_id).emit('form party', {
        inviter: socket.username,
        invitee: data.username
      });
    }
  });

  socket.on('formed party', function () {
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
    // TODO: Check disconnection whether works
    if (questPlayers.length !== 2) 
    {
      console.log('Warning: Curcoord needs 2 people.');
    } else
    {
      var x_sqr = (objCoodinates.x - cur_coord.x) * (objCoodinates.x - cur_coord.x);
      var y_sqr = (objCoodinates.y - cur_coord.y) * (objCoodinates.y - cur_coord.y);
      var distance = Math.sqrt(x_sqr * x_sqr + y_sqr * y_sqr);
      //console.log(socket.username + ': ' + cur_coord.x + ', ' + cur_coord.y + ' has distance: ' + distance);
      if (distance <= 1) 
      {
        // TODO: socket.index is badly implemented
        questPlayers[socket.index].arrived_at_obj = true;
        
        // TODO: Currently, only 2 players are allowd. Implement more players?
        var allArrived = questPlayers[0].arrived_at_obj && questPlayers[1].arrived_at_obj;
        if (allArrived) 
        {
          questPlayers[socket.index].arrived_at_obj = false;
          console.log('Party has arrived at the objective and will fight boss!');
          
          // Tell clients bossInfo
          var randomBoss = getRandomInt(0,2);
          var bossType, bossHealth;
          switch(randomBoss) {
            case 0:
              io.to('quest').emit('party on obj', {
                bossType: 'RedKnight',
                bossHealth: 90
              });
              fightPlayers[0] = 90;
              break;
            case 1:
              io.to('quest').emit('party on obj', {
                bossType: 'Smail',
                bossHealth: 80
              });
              fightPlayers[0] = 80;
              break;
            default:
              io.to('quest').emit('party on obj', {
                bossType: 'LianHwa',
                bossHealth: 110
              });
              fightPlayers[0] = 110;
          }
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

    // Add to fightPlayers
    socket.index = fightPlayers.length;
    console.log('Adding to fightPlayers');
    if (fightPlayers.getSocketObj(socket.username)) {
      console.log('Already contains this username');
      return;
    }
    fightPlayers.push({
      username: socket.username,
      socketid: socket.id,
      connected: true,
    });
    socket.leave('quest');
    socket.join('fight');
  });

  socket.on('attack', function (data) {
    // TODO: Check disconnection whether works
    if (fightPlayers.length !== 3) 
    {
      socket.emit('console', fightPlayers);
      console.log('Warning: Fight needs 2 people.');
    } else if(socket.rooms['fight']) 
    {
      fightPlayers[0] -= data.damage;
      fightPlayers[0] = Math.max(0, fightPlayers[0]);
      console.log(socket.username + ' hit the boss for ' + data.damage + '. The boss has ' + fightPlayers[0] + ' left.');
      
      io.to('fight').emit('boss hit', {
        remainingHealth: fightPlayers[0],
        username: socket.username,
        message: ' hit the boss for ' + data.damage + '. The boss has ' + fightPlayers[0] + ' left.'
      });
      if (fightPlayers[0] <= 0) io.to('fight').emit('boss defeated');
    } 
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
      questPlayers.removeSocketObj(socket.username);
      fightPlayers.removeSocketObj(socket.username);

      // TODO: Check and implement disconnection policy
      // if(socket.rooms['quest']) questPlayers.getSocketObj(socket.username).connected = false;
      // else if(socket.rooms['fight']) fightPlayers.getSocketObj(socket.username).connected = false;

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

    if (data[0] === 'getSolo') socket.emit('console', soloPlayers);
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

// Returns a random integer between min (inclusive) and max (inclusive)
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

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