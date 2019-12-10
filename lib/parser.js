const _ = require('lodash');

function divideArgs(aCommand, argString) {
  //console.log(`divideArgs for ${aCommand}: `, argString);
  var args = {};
  switch (aCommand) {
    case "PING": //> PING :tmi.twitch.tv
      if (argString != '')
        throw `Unexpected PING: ${argString}`;
      break;

    // initial connection (NICK/PASS) response
    case '001': //> :tmi.twitch.tv 001 <user> :Welcome, GLHF!
    case '002': //> :tmi.twitch.tv 002 <user> :Your host is tmi.twitch.tv
    case '003': //> :tmi.twitch.tv 003 <user> :This server is rather new
    case '004': //> :tmi.twitch.tv 004 <user> :-
    case '375': //> :tmi.twitch.tv 375 <user> :-
    case '372': //> :tmi.twitch.tv 372 <user> :You are in a maze of twisty passages.
    case '376': //> :tmi.twitch.tv 376 <user> :>
      var splitArgs = argString.split(' ');
      args.user = splitArgs.shift();
      args.message = splitArgs.join(' ');
      break;

    // NAMES function has multiple responses & thus cases
    case '353': // > :<user>.tmi.twitch.tv 353 <user> = #<channel> :<user1> <user2> ... <userN>
      var namesArgs = argString.split(' ');
      args.request = namesArgs.shift();
      namesArgs.shift(); // shift away the "=" element
      args.channel = namesArgs.shift().slice(1); // remove the #

      //get rid of the : at thje start of the user list
      // then add each user to the users array
      namesArgs[0] = namesArgs[0].slice(1);
      args.users = [];
      namesArgs.forEach((user) => {
        args.users.push(user);
      });
      //console.log("namesArgs", args);
      break;
    case '366': // > :<user>.tmi.twitch.tv 366 <user> #<channel> :End of /NAMES list
      var endOfNamesArgs = argString.split(' ');
      args.request = endOfNamesArgs.shift();
      args.channel = endOfNamesArgs.shift().slice(1);  // remove the #
      args.notice = endOfNamesArgs.join(' ').slice(1); // remove the :
      break;

    // Client capabilities
    case "CAP":
      var capArgs = argString.split(' ');
      args.target = capArgs.shift();
      args.subcommand = capArgs.shift();
      args.capability = capArgs.join(' ');
      break;

    // Basic Changes in User State
    case 'JOIN':       //> :<user>!<user>@<user>.tmi.twitch.tv JOIN #<channel>
    case 'USERSTATE':  //> :tmi.twitch.tv USERSTATE #<channel>
    case 'PART':       //> :<user>!<user>@<user>.tmi.twitch.tv PART #<channel>
      if (argString.charAt(0) !== '#')
        throw `Unexpected ${aCommand}: ${argString}`;
      args.channel = argString.trim().slice(1); // remove the #
      break;

    // Chat Messages
    case 'PRIVMSG':
      if (argString.charAt(0) !== '#')
        throw `Unexpected ${aCommand}: ${argString}`;
      var chatArgs = argString.split(' ');
      args.channel = chatArgs.shift().slice(1); // remove the #
      args.message = chatArgs.join(' ');
      break;

    // Private Messages
    case 'WHISPER':
      var whisArgs = argString.split(' ');
      args.receiptiant = whisArgs.shift();
      if (whisArgs[0].charAt(0) !== ':')
        throw `Unexpected WHISPER: ${argString}`;
      args.message = whisArgs.join(' ').slice(1);
      break;

    case "CLEARMSG":
      args = ((content) => {
        if (content.charAt(0) !== '#')
          throw `Unexpected ${aCommand}: ${argString}`;
        var chatArgs = content.split(' ');
        var response = {};
        response.channel = chatArgs.shift().slice(1); // remove the #
        response.message = chatArgs.join(' ').slice(1); //remove the :
        return response;
      })(argString);
      break;

    case "CLEARCHAT":
      args = ((content) => {
        if (content.charAt(0) !== '#')
          throw `Unexpected ${aCommand}: ${argString}`;
        var chatArgs = content.split(' ');
        var response = {};
        response.channel = chatArgs.shift().slice(1); // remove the #
        response.affected = chatArgs.join(' ').slice(1); //remove the :
        return response;
      })(argString);
      break;

    // Unknown Commands need to be handled.
    // All commands from https://dev.twitch.tv/docs/irc need to be
    // handled
    default:
       console.log(`da: Unknown Command "${aCommand}": ${argString}`);
  }
  //console.log(args);
  return args;
}

function new_formatTAGS(aCommand, tags) {
  var typingMap = { objects : [], boolean : [] };
  switch (aCommand) {
    // Docs: https://dev.twitch.tv/docs/irc/tags#privmsg-twitch-tags
    case "PRIVMSG":
      typingMap.objects = ['badges', 'badge-info'];
      typingMap.boolean = ['mod', 'subscriber', 'turbo'];
      break;
    case "WHISPER":
      typingMap.objects = ['badges'];
      typingMap.boolean = ['turbo'];
      break;
    case "USERSTATE":
      typingMap.objects = ['badges', 'badge-info'];
      typingMap.boolean = ['mod', 'subscriber'];
      break;
    //No Tags To Format - Strings are fine
    case "CLEARCHAT":
    case "CLEARMSG":
      break;
    default:
      console.log(`No Tags To Format "${aCommand}": `, tags);
      return tags;
  }

  // format specific known fields - Booleans
  typingMap.boolean.forEach((field) => {
    tags[field] = Boolean(Number(tags[field]));
  });

  // format specific known fields - Objects (Arrays of <key>/<value> pairs)
  typingMap.objects.forEach((field) => {
    tags[field] = tags[field].split(',');
    var badgeObject = {};
    tags[field].forEach((badgeString) => {
      const [badge, version] = badgeString.split('/');
      badgeObject[badge] = version;
    });
    tags[field] = badgeObject;
  });

  //console.log("Formatted: ", tags);
  return tags;
}

function formatClientPrefix(aCommand, aClientPrefix)  {
  var formattedPrefix = {};
  //> :<user>!<user>@<user>.tmi.twitch.tv JOIN #<channel>
  const serverDomain = "tmi.twitch.tv";

  function validateDomain(userDomain) {
    if (userDomain !== serverDomain)
      throw `Invalid DOMAIN for clientPrefix:${aClientPrefix}`;
    return userDomain;
  }

  switch (aCommand) {
    // initial connection (NICK/PASS) response
    case '001': //> :tmi.twitch.tv 001 <user> :Welcome, GLHF!
    case '002': //> :tmi.twitch.tv 002 <user> :Your host is tmi.twitch.tv
    case '003': //> :tmi.twitch.tv 003 <user> :This server is rather new
    case '004': //> :tmi.twitch.tv 004 <user> :-
    case '375': //> :tmi.twitch.tv 375 <user> :-
    case '372': //> :tmi.twitch.tv 372 <user> :You are in a maze of twisty passages.
    case '376': //> :tmi.twitch.tv 376 <user> :>
    // capability request responses
    case 'CAP':
    // alive check PINGs
    case 'PING':
    // chat moderation commands
    case "CLEARCHAT":
    case "CLEARMSG":
    // chat userstate Changes
    case "USERSTATE":
      formattedPrefix = {
        server : validateDomain(aClientPrefix.slice(1))
      };
      break;

    case '353':
    case '366':
      formattedPrefix = ((prefix) => {
        var choppingBlock = prefix.split(".");
        var res = {};
        res.user = choppingBlock.shift();
        res.server = validateDomain(choppingBlock.join("."));
        return res;
      })(aClientPrefix);
      break;

    // user initiated commands
    case 'PRIVMSG':
    case 'WHISPER':
    case 'JOIN':
    case 'PART':
      var user;
      var choppingBlock = aClientPrefix.slice(1);
      ['!', '@', '.'].forEach((delim) => {
        choppingBlock = choppingBlock.split(delim);
        if (!user)
          user = choppingBlock.shift();
        else {
          const aUser = choppingBlock.shift();
          if (user !== aUser) {
            console.error(`USER: "${user}" vs "${aUser}"`);
            throw `Invalid USER for ${aCommand} clientPrefix:${aClientPrefix}`;
          }
        }
        choppingBlock = choppingBlock.join(delim);
      });

      formattedPrefix = {
        username : user,
        server : validateDomain(choppingBlock)
      };
      break;

    default:
      console.error(`Unknown command ${aCommand} clientPrefix:${aClientPrefix}`);
  }
  return formattedPrefix;
}


module.exports = {

  formatCHANNEL(channel){
    channel = channel.toLowerCase();
    return channel.charAt(0) !== '#' ? '#' + channel : channel;
  },

  format__general(event) {
    // keep a count of messages in the event
    var count = 0;

    /*
    Here is the general format for an individual tag:
      > @tag-name=<tag-name> :tmi.twitch.tv <command> #<channel> :<user>

      Split event on colon, the first element might be tags, if it is pop & parse it
      The next element is command info ALWAYS
      The next element is the content and can very based on command
    */
    function format__line(message) {
      count++;
      var unParsedMsg = message;
      var ircMessage = {
        tags : {}
      };

      // if the first character of the message is @ then there are tags to parse
      if (message.charAt(0) === '@') {
        // spit off the tags as the first element divided by a space
        const tagRawString = unParsedMsg.split(' ').shift();

        // drop the first character "@" & split into array by ";"
        const tagArray = tagRawString.substr(1).split(';');

        tagArray.forEach((tag, idx) => {
          const splitTag = tag.split('=');
          const key = splitTag[0];
          const val = splitTag[1];
          ircMessage.tags[key] = val;
        });

        // removed the processed tag characters
        unParsedMsg = unParsedMsg.slice(tagRawString.length + 1);
      }

      //console.log("tags_added", ircEvent);

      var clientPrefixRAW = unParsedMsg.split(" ").shift();
      unParsedMsg = unParsedMsg.slice(clientPrefixRAW.length + 1); // removed the processed characters
      //console.log("prefix_added", ircEvent);

      // The arguments for each command can have different syntax so savew them as content
      ircMessage.command = unParsedMsg.split(" ").shift();

      ircMessage.content = unParsedMsg.slice(ircMessage.command.length + 1);

      //swap clientPrefix & command for PING commands - different syntax for some reason
      //    e.g. PING :tmi.twitch.tv
      if (clientPrefixRAW === "PING") {
        const tmpCP = clientPrefixRAW;
        const tmpCMD = ircMessage.command;
        ircMessage.command = tmpCP;
        clientPrefixRAW = tmpCMD;
      }

      ircMessage.clientPrefix = formatClientPrefix(ircMessage.command, clientPrefixRAW);


      ircMessage.args = divideArgs(ircMessage.command, ircMessage.content);

      //console.log(`There are ${Object.keys(ircMessage.tags).length} tags: `, ircMessage.tags);
      if(Object.keys(ircMessage.tags).length >= 1)
        ircMessage.tags = new_formatTAGS(ircMessage.command, ircMessage.tags);

      return ircMessage;
    }

    //console.log(`LF Idx: ${event.indexOf("\n")}, CR Idx: ${event.indexOf("\r")}`);
    //var toBeParsed = event;
    var ircEvent = {
      ircMessages : [],
      ts : Date.now(),
      count: 0
    };


    event.split("\r\n").forEach((ele, idx) => {
      if (ele.length > 0)
        ircEvent.ircMessages.push(format__line(ele));
    });
    ircEvent.count = count;

    //console.log(`Messages Processed`, ircEvent);
    return ircEvent;
  },

  formatTAGS(tagstring) {
    let tagObject = {};
    const tags =tagstring.replace(/\s/g,' ').split(';');

    tags.forEach(tag => {
      const split_tag = tag.split('=');
      const name = split_tag[0].replace(/-/g, '_').replace('@', '').trim();
      let val = this.formatTagVal(split_tag[1]);
      tagObject[name] = val;
    });

    if (tagObject.badges){
      tagObject.badges = this.formatBADGES(tagObject.badges);
    }

    return tagObject;
  },

  formatBADGES(badges){
    let badgesObj = {};
    if(badges) {
      badges = badges.split(',');

      badges.forEach(badge => {
        const split_badge = badge.split('/');
        badgesObj[split_badge[0]] = +split_badge[1];
      });
    }
    return badgesObj;
  },


  formatUSERNOTICE(event){
    const parsed = {};

    const msg_parts = event.split('USERNOTICE')[1];
    let split_msg_parts = msg_parts.split(' :');

    parsed.channel = split_msg_parts[0].trim();
    parsed.message = split_msg_parts[1] || null;

    let tags = event.split('USERNOTICE')[0].split(':')[0].trim();

    Object.assign(parsed,this.formatTAGS(tags));
    return parsed;
  },

  formatTagName(tag) {
      return tag.replace(/-/g, '_').replace('@', '').trim();
  },

  formatTagVal(val) {
    if(!val)
      return null;
    if(val.match(/^[0-9]+$/) !== null) {
      return +val;
    }
    if (val.includes('\s')){
      val = val.replace(/\\s/g, ' ');
    }
    return val.trim();
  }

};
