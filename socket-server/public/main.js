$(function() {
  var PING_FREQUENCY = 5;
  var COLORS = [
    '#e21400', '#91580f', '#f8a700', '#f78b00',
    '#58dc00', '#287b00', '#a8f07a', '#4ae8c4',
    '#3b88eb', '#3824aa', '#a700ff', '#d300e7'
  ];

  // Initialize variables
  var socket = io();
  var $window = $(window);
  var $chatPage = $('.chat.page'); // The chatroom page
  var $messages = $('.messages'); // Messages area
  var $inputMessage = $('.inputMessage'); // Input message input box
  var $currentInput = $inputMessage.focus();

  var connected = false;
  var arrivedAtObj = false;

  // Log a message
  function log (message) {
    var $el = $('<li>').addClass('log').text(message);
    addMessageElement($el);
  }

  // Adds the visual chat message to the message list
  function addChatMessage (data) {
    var $usernameDiv = $('<span class="username"/>')
      .text(data.username)
      .css('color', getUsernameColor(data.username));
    var $messageBodyDiv = $('<span class="messageBody">')
      .text(data.message);

    var $messageDiv = $('<li class="message"/>')
      .data('username', data.username)
      .append($usernameDiv, $messageBodyDiv);

    addMessageElement($messageDiv);
  }

  // Adds a message element to the messages and scrolls to the bottom
  // el - The element to add as a message
  function addMessageElement (el) {
    var $el = $(el);

    $messages.append($el);
    $messages[0].scrollTop = $messages[0].scrollHeight;
  }

  // Gets the color of a username through our hash function
  function getUsernameColor (username) {
    // Compute hash code
    var hash = 7;
    for (var i = 0; i < username.length; i++) {
       hash = username.charCodeAt(i) + (hash << 5) - hash;
    }
    // Calculate color
    var index = Math.abs(hash % COLORS.length);
    return COLORS[index];
  }

  // Keyboard events
  $window.keydown(function (event) {
    // Auto-focus the current input when a key is typed
    if (!(event.ctrlKey || event.metaKey || event.altKey)) {
      $currentInput.focus();
    }
    // When the client hits ENTER on their keyboard
    if (event.which === 13) {
      var message = $inputMessage.val();
      // Prevent markup from being injected into the message
      message = $('<div/>').text(message).text();
      // if there is a non-empty message and a socket connection
      if (message && connected) {
        $inputMessage.val('');

        message_parts = message.split(/[ ]+/);
        if (message_parts[0] === 'invite') socket.emit('invite', { username: message_parts[1] });
        else if (message_parts[0] === 'attack') socket.emit('attack', { damage: getRandomInt(20, 40) });
        else if (message_parts[0] === 'arrive') {
          log('Arrived at the objective.');
          arrivedAtObj = true;
        }
        else if (message_parts[0] === 'ready') {
          log('You are ready.');
          socket.emit('is ready', true);
        }
        else socket.emit('new message', message);
      }
    }
  });

  // Timer controllers
  var looking_for_party;
  var send_coordinates;

  socket.emit('add user');
  
  socket.on('login', function (data) {
    connected = true;
    // Display the welcome message
    var message = "Welcome " +  data.username + ", you have logged in.";
    log(message);

    log('Looking for other solo members...');
    looking_for_party = setInterval(function() {
      socket.emit('get solos');
    }, PING_FREQUENCY * 1000);
  });


  socket.on('form party', function (quest) {
    log(quest.inviter + ' has formed a questing party with ' + quest.invitee + '!');
    log('Your objective is ' + quest.obj);

    // Stop querying for solo players
    clearInterval(looking_for_party); 
    // Transition from Solo to Quest
    socket.emit('transition quest');

    send_arrived = setInterval(function() {
      socket.emit('has arrived', arrivedAtObj);
    }, PING_FREQUENCY * 1000);
  });

  // socket.on('arrive data', function (data) {
  //   log(data.d1user + ': Connected - ' + data.d1conn + '. Arrived - ' +  data.d1arri);
  //   log(data.d2user + ': Connected - ' + data.d2conn + '. Arrived - ' +  data.d2arri);
  // });

  socket.on('party on obj', function (data) {
    log('Party has reached the objective! Waiting for both players to be ready...');

    // Stop sending arrived to server 
    clearInterval(send_arrived);
    socket.emit('transition prep');
  });

  socket.on('party is ready', function (data) {
    log('Both players are ready! Spawning boss...');

    // Stop sending arrived to server 
    socket.emit('transition fight');
  });

  socket.on('spawn boss', function (data) {
    var bossType = data.bossType;
    var bossHealth = data.bossHealth;
    log('Fighting a ' + bossType + ' with ' + bossHealth + ' health.');
  });

  socket.on('boss hit', function (data) {
    addChatMessage(data);
  });

  socket.on('quest completed', function (){
    // TODO: Rewards
    log('CONGRATULATIONS! YOU HAVE DEFEATED ALL THE MONSTERS! HERE ARE YOUR REWARDS...');

    arrivedAtObj = false;
    socket.emit('back transition solo');
    log('Back to looking for other solo members...');
    looking_for_party = setInterval(function() {
      socket.emit('get solos');
    }, PING_FREQUENCY * 1000);
  });

  // Whenever the server emits 'new message', update the chat body
  socket.on('new message', function (data) {
    addChatMessage(data);
  });

  // Whenever the server emits 'user joined', log it in the chat body
  socket.on('user joined', function (data) {
    log(data.username + ' logged in.');
  });

  // Whenever the server emits 'user left', log it in the chat body
  socket.on('user left', function (data) {
    log(data.username + ' left');
  });

  socket.on('disconnect', function () {
    log('You have been disconnected');
  });

  socket.on('reconnect', function () {
    log('You have been reconnected');
    socket.emit('add user');
  });

  socket.on('reconnect_error', function () {
    log('Attempt to reconnect has failed');
  });

  socket.on('console', function (data) {
    console.log(data);
  });  
  
  // Returns a random integer between min (inclusive) and max (inclusive)
  function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
});
