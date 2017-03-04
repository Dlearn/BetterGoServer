$(function() {
  var PING_FREQUENCY = 5;
  var cur_x = 50, cur_y = 50; // TODO Actual coordinate system
  var COLORS = [
    '#e21400', '#91580f', '#f8a700', '#f78b00',
    '#58dc00', '#287b00', '#a8f07a', '#4ae8c4',
    '#3b88eb', '#3824aa', '#a700ff', '#d300e7'
  ];

  // Initialize variables
  var $window = $(window);
  var $chatPage = $('.chat.page'); // The chatroom page
  var $messages = $('.messages'); // Messages area
  var $inputMessage = $('.inputMessage'); // Input message input box

  var connected = false;
  var $currentInput = $inputMessage.focus();

  var socket = io();

  function addParticipantsMessage (data) {
    var message = '';
    if (data.numUsers === 1) {
      message += "there's 1 participant";
    } else {
      message += "there are " + data.numUsers + " participants";
    }
    log(message);
  }

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
        if (message_parts[0] === 'invite') socket.emit('invite', message_parts[1]);
        else if (message_parts[0] === 'attack') socket.emit('attack', getRandomInt(10, 30));
        else socket.emit('new message', message);
      }
    }
  });

  // Timer controllers
  var looking_for_party;
  var send_coordinates;

  socket.emit('add user');

  // Whenever the server emits 'login', log the login message
  socket.on('login', function (data) {
    connected = true;
    // Display the welcome message
    var message = "Welcome to Socket.IO Chat – ";
    log(message);
    addParticipantsMessage(data);

    looking_for_party = setInterval(function() {
      socket.emit('who is solo');
    }, PING_FREQUENCY * 1000);
  });

  socket.on('solo players', function(data) {
    var message = '';
    data.forEach(function (user)
    {
      message += user.username + ', ';
    });
    log(message);
  });

  socket.on('form party', function (quest) {
    log(quest.inviter + ' has formed a questing party with ' + quest.invitee + '!');
    // TODO: Set quest.obj map marker on map
    socket.emit('formed party');
    clearInterval(looking_for_party); // Stop querying for solo players

    send_coordinates = setInterval(function() {
      jitter_x = getRandomInt(-2, 2);
      jitter_y = getRandomInt(-2, 2);
      socket.emit('cur coord', {
        x: cur_x + jitter_x,
        y: cur_y + jitter_y
      });
    }, PING_FREQUENCY * 1000);
  });

  socket.on('quest disband', function () {
    log('Quest disbanded. Looking for other solo players.');
    clearInterval(send_coordinates);
    
    socket.emit('looking for party');
    looking_for_party = setInterval(function() {
      socket.emit('who is solo');
    }, PING_FREQUENCY * 1000);
  });

  socket.on('party on obj', function () {
    log('Party has reached the objective!');
    socket.emit('fighting boss');
    clearInterval(send_coordinates);
  });

  socket.on('fight disband', function () {
    log('Fight disbanded. Looking for other solo players.');
    
    socket.emit('looking for party');
    looking_for_party = setInterval(function() {
      socket.emit('who is solo');
    }, PING_FREQUENCY * 1000);
  });

  socket.on('boss hit', function (data) {
    addChatMessage(data);
  });

  socket.on('boss defeated', function (){
    log('CONGRATULATIONS! BOSS DEFEATED! HERE ARE YOUR REWARDS...');

    socket.emit('looking for party');
    log('Looking for other solo members...');
    looking_for_party = setInterval(function() {
      socket.emit('who is solo');
    }, PING_FREQUENCY * 1000);
  });

  // Whenever the server emits 'new message', update the chat body
  socket.on('new message', function (data) {
    addChatMessage(data);
  });

  // Whenever the server emits 'user joined', log it in the chat body
  socket.on('user joined', function (data) {
    log(data.username + ', ' + data.socketid + ', joined');
    addParticipantsMessage(data);
  });

  // Whenever the server emits 'user left', log it in the chat body
  socket.on('user left', function (data) {
    log(data.username + ' left');
    addParticipantsMessage(data);
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
