'use strict';

console.log("FISHY BOT FORK");

const tls = require('tls');
const assert = require('assert');
const EventEmitter = require('events').EventEmitter;
const parser = require('./parser');
const ackInital = {ack:false, type: "", msg: "", };

const twitchCapPath= ':twitch.tv/';
const twitchCapabilites = {
  'tags': Object.assign({},ackInital),
  'membership': Object.assign({},ackInital),
  'commands': Object.assign({},ackInital)
};
//console.log("initTC: ",twitchCapabilites);

var loginResponses = {
    '001': Object.assign({res: ':Welcome, GLHF!'}, ackInital),
    '002': Object.assign({res: ':Your host is tmi.twitch.tv'}),
    '003': Object.assign({res: ':This server is rather new'}),
    '004': Object.assign({res: ':-'}),
    '375': Object.assign({res: ':-'}),
    //'372': {res: ':You are in a maze of twisty passages.'},            //dev docs say this
    '372': Object.assign({res: ':You are in a maze of twisty passages, all alike.'}),   //server sends this
    '376': Object.assign({res: ':>'})
};

/*
< JOIN #<channel>
> :<user>!<user>@<user>.tmi.twitch.tv JOIN #<channel>
> :<user>.tmi.twitch.tv 353 <user> = #<channel> :<user>
> :<user>.tmi.twitch.tv 366 <user> #<channel> :End of /NAMES list
*/

var joinResponsesX = {
  'JOIN' : Object.assign({},ackInital),
  '353' : Object.assign({},ackInital),
  '366' : Object.assign({},ackInital)
};

function initJoinResponses(aUser, channels) {
  var initJoinResponses = {};
  channels.forEach((channel) => {
    var joinResponses = {
      'JOIN' : {res: `#${channel}`},
      '353'  : {res: `${aUser} = #${channel} :${aUser}`},
      '366'  : {res: `${aUser} #${channel} :End of /NAMES list`}
    };
    Object.keys(joinResponses).forEach((key) => {
      joinResponses[key].ack = false;
    });
    initJoinResponses[channel] = joinResponses;
  });
  return initJoinResponses;
}


var joinResponsesY = {};
var responseChannelJoins = {};


var responseCodeMap = {};
Object.keys(loginResponses).forEach((key) => {
  responseCodeMap[key] = 'PASS/NICK';
});

function emitMultilineResponse(commandFlags, emitter, event, message) {
  var isComplete = true;
  Object.keys(commandFlags).forEach((command) => {
    isComplete = isComplete && commandFlags[command].ack;
  });

  if (isComplete) {
    console.log(`${message}`, commandFlags);
    emitter.emit(event, commandFlags);
  }
}

const TwitchBot = class TwitchBot extends EventEmitter {

  constructor({
    username,
    oauth,
    channels=[],
    port=443,
    silence=false
  }) {
    super();

    try {
      assert(username);
      assert(oauth);
    } catch(err) {
      throw new Error('missing or invalid required arguments');
    }

    this.username = username;
    this._oauth = oauth;
    this.channels = [];
    this.joinResponses = initJoinResponses(username, channels);
    channels.forEach(channel => {
      responseChannelJoins[channel] = (new Object(joinResponsesX));
      this.channels.push(channel);
    });

    //console.log("t.ch:", this.channels);

    this.irc = new tls.TLSSocket();
    this.port = port;
    this.silence = silence;

    this._connect();
  }

  async _connect() {
    this.irc.connect({
      host: 'irc.chat.twitch.tv',
      port: this.port
    });
    this.irc.setEncoding('utf8');
    this.irc.once('connect', () => {
      this.afterConnect();
    });

  }

  async afterConnect(){
    this.irc.on('error', err => this.emit('error', err));
    this.listen();

    this.writeIrcMessage("PASS " + this._oauth);
    this.writeIrcMessage("NICK " + this.username);
    //await this.irc.once('data', data => {console.log('PASS/NICK', data);});

    this.channels.forEach(channel => {
      this.writeIrcMessage(`JOIN #${channel}`);
    });

    // request access to each capability
    Object.keys(twitchCapabilites).forEach((capability) => {
      //console.log('cap', capability);
      this.writeIrcMessage(`CAP REQ ${twitchCapPath}${capability}`);
    });

    this.emit('connected');
  }

  // TODO: Make this parsing better
  listen() {
    this.irc.on('data', data => {
      this.checkForError(data);
      console.log(">>", data);
      const ircEvent = parser.format__general(data);
      ircEvent.ircMessages.forEach((ircMessage) => {

        var mappedCommand = ircMessage.command;
        if(responseCodeMap.hasOwnProperty(mappedCommand)) {
          mappedCommand = responseCodeMap[mappedCommand];
        }

        //console.log('loginResponses', loginResponses['001']);

        switch (mappedCommand) {

          case 'PING':
            this.irc.write('PONG :tmi.twitch.tv\r\n');
            break;

          case 'PRIVMSG':
            var chatter = ircMessage.tags;
            chatter.username = ircMessage.clientPrefix.username;
            chatter.message = ircMessage.args.message;
            chatter.channel = ircMessage.args.channel;
            this.emit('chatter', chatter);
            break;

          case 'WHISPER':
            var whisper = ircMessage.tags;
            whisper.username = ircMessage.clientPrefix.username;
            whisper.message = ircMessage.args.message;
            console.log("whisper", whisper);
            this.emit('whisper', whisper);
            break;

          case 'JOIN':
            var join = {
              username : ircMessage.clientPrefix.username,
              channel : ircMessage.args.channel
            };
            // responseChannelJoins - make a map and then update the flags
            if(join.username === this.username) {
              const jIdx = join.channel;
              const eventString = 'connected';
              const message = `Initial Join on #${jIdx} Complete: `;
              this.joinResponses[jIdx].JOIN.ack = true;
              emitMultilineResponse(this.joinResponses[jIdx],this, eventString, message);
              //console.log("t.jr", this.joinResponses[jIdx]);
            }
            this.emit('join', join);
            break;

          case 'PART':
            var part = {
              username : ircMessage.clientPrefix.username,
              channel : ircMessage.args.channel
            };
            this.emit('part', part);
            break;

          case 'CAP':
            if (ircMessage.args.target !== "*" ||
                ircMessage.args.subcommand !== "ACK") {
              console.error('No Response: ', ircMessage);
              throw `Unknown Capability Response`;
            }
            const capability = ircMessage.args.capability.split(twitchCapPath)[1];

            //console.log("cap", capability);
            twitchCapabilites[capability].ack = true;
            const capEventString = 'acknowledged';
            const capMessage = `Twitch Capabilites for ${this.username} Enabled: `;
            emitMultilineResponse(twitchCapabilites,this,capEventString, capMessage);
            break;

          case 'PASS/NICK':
            if(!loginResponses[ircMessage.command]) {
              console.error("ircMessage: ", ircMessage);
              throw `Unknown command code ${ircMessage.command}`;
            }

            if(loginResponses[ircMessage.command].res !== ircMessage.args.message) {
              console.error("ircMessage: ", ircMessage);
              throw `Unexpected response for code: ${ircMessage.command}`;
            }

            if(this.username !== ircMessage.args.user) {
              console.error("ircMessage: ", ircMessage);
              throw `Unexpected response for user: ${ircMessage.command}`;
            }

            loginResponses[ircMessage.command].ack = true;
            const authEventString = 'authenticated';
            const authMessage = `Login Response for ${this.username} Completed: `;
            emitMultilineResponse(loginResponses,this,authEventString, authMessage);
            break;

          case '353':
          case '366':
            var idx = {
              CH : ircMessage.args.channel,
              CO : ircMessage.command,
            };

            if(this.joinResponses.hasOwnProperty([idx.CO])) {
              console.error("ircMessage: ", ircMessage);
              throw `Unexpected channel for code: ${idx.CO}`;
            }

            if(ircMessage.args.request !== this.username) {
              console.error("ircMessage: ", ircMessage);
              throw `Unexpected request for code: ${idx.CO}`;
            }

            //KEEP THIS SEPARATE UNTIL i'M SURE THAT i'M NOT RUNNING INTO
            //OTHER ISSUES... ALSO TURN OFF CAPS LOCK...
            if(idx.CO === '353' && !ircMessage.args.users.includes(this.username)) {
              console.error("ircMessage: ", ircMessage);
              throw `Bot not in channel list for code: ${idx.CO}`;
            }

            this.joinResponses[idx.CH][idx.CO].ack = true;

            const eventString = 'connected';
            const message = `Initial Join on #${idx.CH} Complete: `;
            emitMultilineResponse(this.joinResponses[idx.CH],this, eventString, message);

            break;

          case 'CLEARMSG':
            var clearChatter = ircMessage.tags;
            clearChatter.username = ircMessage.clientPrefix.username;
            clearChatter.message = ircMessage.args.message;
            clearChatter.channel = ircMessage.args.channel;
            this.emit('clearChatter', clearChatter);
            break;

          case 'CLEARCHAT':
            var timeoutChatter = ircMessage.tags;
            timeoutChatter.username = ircMessage.clientPrefix.username;
            timeoutChatter.message = ircMessage.args.message;
            timeoutChatter.channel = ircMessage.args.channel;
            // in the case of a ban, the timeout has no ban_duration
            // flag this with an impossible value of a -1sec timeout
            if(!ircMessage.tags.hasOwnProperty('ban-duration')) {
              ircMessage.tags['ban-duration'] = '-1';
            }
            this.emit('timeout', timeoutChatter);
            break;

          case 'USERSTATE':
            if (this.username !== ircMessage.tags['display-name'].toLowerCase()) {
              console.error("ircMessage: ", ircMessage);
              throw `Unexpected response for user: ${ircMessage.command}`;
            }

            var botUserstate = Object.assign({}, ircMessage.tags);
            botUserstate.channel = ircMessage.args.channel;
            this.emit('botstate', botUserstate);
            break;

          default:
            console.log(`${ircMessage.command} Not Supported by twitch-bot`);
            console.log(`FORMATTED MESSAGE: `, ircMessage);
        }
      });

      if(data.includes('USERNOTICE ')) {
        const event = parser.formatUSERNOTICE(data);
        if (['sub', 'resub'].includes(event.msg_id) ){
          this.emit('subscription', event);
        }
      }
    });
  }

  checkForError(event) {
    /* Login Authentication Failed */
    if(event.includes('Login authentication failed')) {
      this.irc.emit('error', {
        message: 'Login authentication failed'
      });
    }
    /* Auth formatting */
    if(event.includes('Improperly formatted auth')) {
      this.irc.emit('error', {
        message: 'Improperly formatted auth'
      });
    }
    /* Notice about blocked messages */
    if(event.includes('Your message was not sent because you are sending messages too quickly')) {
      this.irc.emit('error', {
        message: 'Your message was not sent because you are sending messages too quickly'
      });
    }
  }

  writeIrcMessage(text) {
    this.irc.write(text + "\r\n");
  }

  join(channel) {
    channel = parser.formatCHANNEL(channel);
    this.writeIrcMessage(`JOIN ${channel}`);
  }

  part(channel) {
    if(!channel && this.channels.length > 0) {
      channel = this.channels[0];
    }
    channel = parser.formatCHANNEL(channel);
    this.writeIrcMessage(`PART ${channel}`);
  }

  say(message, channel, callback ) {
    if(!channel) {
      channel = this.channels[0];
    }

    //console.log(`m: ${message}, ch: ${channel}, cb: ${callback}`);
    if(message.length >= 500) {
      this.cb(callback, {
        sent: false,
        message: 'Exceeded PRIVMSG character limit (500)'
      });
    } else {
      this.writeIrcMessage('PRIVMSG #' + channel + ' :' + message);
    }
  }

  timeout(username, channel, duration=600, reason='') {
    if(!channel) {
      channel = this.channels[0];
    }
    this.say(`/timeout ${username} ${duration} ${reason}`, channel);
  }

  ban(username, channel, reason='') {
    if(!channel) {
      channel = this.channels[0];
    }
    this.say(`/ban ${username} ${reason}`, channel);
  }

  close() {
    this.irc.destroy();
    this.emit('close');
  }

  cb(callback, obj) {
    if(callback) {
      obj.ts = new Date();
      callback(obj);
    }
  }

};

module.exports = TwitchBot;
