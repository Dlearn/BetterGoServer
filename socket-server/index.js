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
questPlayers.push(false);
var prepPlayers = [];
var fightPlayers = [];
fightPlayers.push(0);

/*
 * There are 4 rooms
 * 'solo'
 * 'quest'
 * 'prep'
 * 'fight'
 */

io.on('connection', function (socket) {
  var addedUser = false;

  // when the client emits 'add user', this listens and executes
  socket.on('add user', function (username) {
    if (addedUser) return; // No double connections
    addedUser = true;
    numUsers++;

    // we store the username in the socket session for this client
    if (username) 
      socket.username = username;
    else 
      socket.username = 'Desktop'+numUsers.toString();

    if (questPlayers.getSocketObj(socket.username)) 
    {
      if (questPlayers[0]) 
      {
        // Remove from questPlayers
        questPlayers.removeSocketObj(socket.username);

        if (prepPlayers.getSocketObj(socket.username))
        {
          console.log('Attempting to double add into prep');
          return;
        }

        prepPlayers.push({
          username: socket.username,
          ready: false,
        });
        socket.leave('quest');
        socket.join('prep');
      } else
      {
        questPlayers.getSocketObj(username).connected = true;
        socket.join('quest');
        return;
      }
    } 

    //console.log('User ' + socket.username + ' connected to solo pool.');
    socket.join('solo');
    soloPlayers.push({
      username: socket.username,
      socketid: socket.id
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
    if (socket.username === data.username) return; // Cannot invite yourself

    // Find invitee's socketid
    var invitee_id = soloPlayers.getSocketObj(data.username).socketid;
    if (invitee_id)
    {
      /*
       * Dylan\'s Room
       * Saga Courtyard
       * Elm Courtyard
       * Cendana Courtyard
       * MPH
       * Library
       */

      var randomObj = getRandomInt(0,2);
      var objLocation = '';
      switch(randomObj) {
        case 0:
          objLocation = 'MPH'
          break;
        default:
          objLocation = 'Library'
      }

      var payload = {
        obj: objLocation,
        inviter: socket.username,
        invitee: data.username,
      }
      // Inviter joins the party
      socket.emit('form party', payload);
      // Invitee joins the party
      socket.broadcast.to(invitee_id).emit('form party', payload);

      questPlayers[0] = false; // Make sure that questroom is reset - not arrived at objective
    }
  });

  socket.on('transition quest', function () {
    // Remove from soloPlayers
    soloPlayers.removeSocketObj(socket.username);

    // Add to questPlayers
    questPlayers.push({
      username: socket.username,
      connected: true,
      arrivedAtObj: false
    });

    socket.leave('solo');
    socket.join('quest');
  });

  socket.on('has arrived', function (arrivedAtObj) {
    console.log('Has arrived from ' + socket.username + ' || ' + socket.id);
    if (questPlayers.length !== 3) 
    {
      console.log('Waiting for both players to join quest.');
      return;
    } 

    var questPlayer = questPlayers.getSocketObj(socket.username);
    // TODO: Do I need this line?
    //questPlayer.connected = true;
    questPlayer.arrivedAtObj = arrivedAtObj;

    socket.emit('arrive data', {
      d1user: questPlayers[1].username,
      d1conn: questPlayers[1].connected,
      d1arri: questPlayers[1].arrivedAtObj,
      d2user: questPlayers[2].username,
      d2conn: questPlayers[2].connected,
      d2arri: questPlayers[2].arrivedAtObj,
    });

    if (!questPlayers[1].connected)
    {
      console.log(questPlayers[0].username + ' isn\'t connected');
      return;
    } 
    if(!questPlayers[2].connected) 
    {
      console.log(questPlayers[1].username + ' isn\'t connected');
      return;
    }
    
    var allArrived = questPlayers[1].arrivedAtObj && questPlayers[2].arrivedAtObj;
    if (allArrived) 
    {
      questPlayers[1].arrivedAtObj = false; // To prevent other player from also realizing that both are done
      console.log('Party has arrived at the objective and are prepping!');
      questPlayers[0] = true; // We've reached the objective!
      
      io.to('quest').emit('party on obj');
    }
  });

  socket.on('transition prep', function () {
    // Remove from questPlayers
    questPlayers.removeSocketObj(socket.username);

    prepPlayers.push({
      username: socket.username,
      ready: false,
    });
    socket.leave('quest');
    socket.join('prep');
  });

  socket.on('is ready', function (playerReady) {
    if (prepPlayers.length !== 2) 
    {
      console.log('Waiting for both players to join prep.');
      return;
    } 

    var prepPlayer = prepPlayers.getSocketObj(socket.username);
    prepPlayer.ready = playerReady;
    
    var allReady = prepPlayers[0].ready && prepPlayers[1].ready;
    if (allReady) {
      prepPlayers[0].ready = false; // To prevent other player from also realizing that both are ready
      console.log('BOTH READY!');
      // The server randomize a boss for clients
      var randomBoss = getRandomInt(0,2);
      var bossType = '', bossHealth = 0;
      switch(randomBoss) {
        case 0:
          bossType = 'RedKnight';
          bossHealth = 90;
          break;
        case 1:
          bossType = 'Smail';
          bossHealth = 80;
          break;
        default:
          bossType = 'LianHwa';
          bossHealth = 110;
      }
      io.to('prep').emit('spawn boss', {
        bossType: bossType,
        bossHealth: bossHealth
      });
      fightPlayers[0] = bossHealth;
    }
  });

  socket.on('transition fight', function () {
    // Remove from prepPlayers
    prepPlayers.removeSocketObj(socket.username);
    
    fightPlayers.push({
      username: socket.username,
    });
    socket.leave('prep');
    socket.join('fight');
  });

  socket.on('attack', function (data) {
    if (fightPlayers.length !== 3) 
    {
      socket.emit('console', fightPlayers);
      console.log('Warning: Fight needs 2 people.');
    } else
    {
      // TODO: DO WE NEED TO CHECK FOR DISCONNECTION POLICY?
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

  socket.on('back transition solo', function () {
    socket.leave('quest');
    questPlayers.removeSocketObj(socket.username);
    socket.leave('fight');
    fightPlayers.removeSocketObj(socket.username);

    socket.join('solo');
    soloPlayers.push({
      username: socket.username,
      socketid: socket.id,
    });
  });

  // when the user disconnects.. perform this
  socket.on('disconnect', function () {
    if (addedUser) {
      console.log('User ' + socket.username + ' disconnected.');
      --numUsers;

      soloPlayers.removeSocketObj(socket.username);
      if(questPlayers.getSocketObj(socket.username)) 
      {
        questPlayers.getSocketObj(socket.username).connected = false;
        questPlayers.getSocketObj(socket.username).arrivedAtObj = false;
        socket.leave('quest');
      }
      else if(fightPlayers.getSocketObj(socket.username)) 
      {
        fightPlayers.getSocketObj(socket.username).connected = false;
        socket.leave('fight');
      }

      // echo globally that this client has left
      socket.broadcast.emit('user left', {
        username: socket.username,
      });
    }
  });

  // when the client emits 'new message', this listens and executes
  socket.on('new message', function (data) {
    data = data.split(/[ ]+/);

    if (data[0] === 'getSolo') socket.emit('console', soloPlayers);
    else if (data[0] === 'getQuest') socket.emit('console', questPlayers);
    else if (data[0] === 'getPrep') socket.emit('console', prepPlayers);
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