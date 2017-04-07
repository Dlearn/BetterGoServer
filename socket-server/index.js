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
fightPlayers.push(1); // phase
fightPlayers.push(0); // current boss's remaining health

/*
 * There are 4 rooms with respective array handlers
 * 'solo'   soloPlayers
 * 'quest'  questPlayers
 * 'prep'   prepPlayers
 * 'fight'  fightPlayers
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
    console.log('User ' + socket.username + ' connected.');

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

    socket.join('solo');
    // Ensure we do not double add players
    if (soloPlayers.getSocketObj(socket.username)) return;
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

      var randomObj = getRandomInt(0,4);
      var objLocation = '';
      switch(randomObj) {
        case 0:
          objLocation = 'Saga'
          break;
        case 1:
          objLocation = 'Elm'
          break;
        case 2:
          objLocation = 'Library'
          break;
        case 3:
          objLocation = 'MPH'
          break;
        default: 
          objLocation = 'Cendana'
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

    if(questPlayers.getSocketObj(socket.username)) return;
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
    //console.log('Arrival Data from ' + socket.username + ' || ' + socket.id);
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
      console.log(questPlayers[1].username + ' isn\'t connected');
      return;
    } 
    if(!questPlayers[2].connected) 
    {
      console.log(questPlayers[2].username + ' isn\'t connected');
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

    if(prepPlayers.getSocketObj(socket.username)) return;
    prepPlayers.push({
      username: socket.username,
      ready: false,
    });
    socket.leave('quest');
    socket.join('prep');
  });

  socket.on('is ready', function (playerReady) {
    var prepPlayer = prepPlayers.getSocketObj(socket.username);
    prepPlayer.ready = playerReady;
    
    if (prepPlayers.length !== 2) 
    {
      console.log('Waiting for both players to join prep.');
      return;
    } 

    var allReady = prepPlayers[0].ready && prepPlayers[1].ready;
    if (allReady) {
      prepPlayers[0].ready = false; // To prevent other player from also realizing that both are ready
      console.log('Both players are ready and will begin fighting!');
      // The server randomize a boss for clients
      // var randomBoss = getRandomInt(0,2);
      // var bossType = '', bossHealth = 0;
      // switch(randomBoss) {
      //   case 0:
      //     bossType = 'RedKnight';
      //     bossHealth = 90;
      //     break;
      //   case 1:
      //     bossType = 'Smail';
      //     bossHealth = 80;
      //     break;
      //   default:
      //     bossType = 'LianHwa';
      //     bossHealth = 110;
      // }
      io.to('prep').emit('party is ready');
      //io.to('prep').emit('spawn boss', {
      //   bossType: 'Smail',
      //   bossHealth: 80
      // });
      // fightPlayers[0] = 1;
      // fightPlayers[1] = 80;
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

    if (fightPlayers.length === 4) 
    {
      io.to('fight').emit('spawn boss', {
        bossType: 'Smail',
        bossHealth: 90
      });
      fightPlayers[0] = 1;
      fightPlayers[1] = 90;
    }
  });

  socket.on('attack', function (data) {
    if (fightPlayers.length !== 4) 
    {
      socket.emit('console', fightPlayers);
      console.log('Warning: Fight needs 2 people.');
    } else
    {
      // TODO: CHECK FOR DISCONNECTION POLICY
      fightPlayers[1] -= data.damage;
      fightPlayers[1] = Math.max(0, fightPlayers[1]);
      console.log(socket.username + ' hit the boss for ' + data.damage + '. The boss has ' + fightPlayers[0] + ' left.');
      
      io.to('fight').emit('boss hit', {
        remainingHealth: fightPlayers[1],
        username: socket.username,
        message: ' hit the boss for ' + data.damage + '. The boss has ' + fightPlayers[1] + ' left.'
      });

      // Defeated this monster
      if (fightPlayers[1] <= 0) 
      {
        fightPlayers[0]++;
        // Finished all 4 phases
        if (fightPlayers[0] < 5)
        {
          if (fightPlayers[0] === 2 || fightPlayers[0] === 3)
          {
            io.to('fight').emit('spawn boss', {
              bossType: 'RedKnight',
              bossHealth: 90
            });
            fightPlayers[1] = 90;
          } else if (fightPlayers[0] == 4)
          {
            io.to('fight').emit('spawn boss', {
              bossType: 'LianHwa',
              bossHealth: 110
            });
            fightPlayers[1] = 120;
          }

        } else // fightPlayers[0] === 5
        {
          io.to('fight').emit('quest completed');
        }
      }
    } 
  });

  socket.on('back transition solo', function () {
    socket.leave('quest');
    questPlayers.removeSocketObj(socket.username);
    socket.leave('fight');
    fightPlayers.removeSocketObj(socket.username);

    socket.join('solo');
    // Ensure we do not double add players
    if (!prepPlayers.getSocketObj(socket.username))
    {
      soloPlayers.push({
        username: socket.username,
        socketid: socket.id
      });
    }
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