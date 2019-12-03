const _ = require('lodash');

module.exports = {

  formatCHANNEL(channel){
    channel = channel.toLowerCase();
    return channel.charAt(0) !== '#' ? '#' + channel : channel;
  },

  formatJOIN(event){
    event = event.replace(/\r\n/g, '');
    return event.split('JOIN ')[1];
  },

  formatPART(event){

    event = event.replace(/\r\n/g, '');
    return event.split('PART ')[1];
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

      ircMessage.clientPrefix = unParsedMsg.split(" ").shift();
      unParsedMsg = unParsedMsg.slice(ircMessage.clientPrefix.length + 1); // removed the processed characters
      //console.log("prefix_added", ircEvent);


      ircMessage.command = unParsedMsg.split(" ").shift();
      unParsedMsg = unParsedMsg.slice(ircMessage.command.length + 1); // removed the processed characters
      //console.log("command_added", ircEvent);


      ircMessage.channel = unParsedMsg.split(" ").shift();
      ircMessage.content = unParsedMsg.slice(ircMessage.channel.length + 1); // removed the processed characters

      return ircMessage;
    }

    console.log(`LF Idx: ${event.indexOf("\n")}, CR Idx: ${event.indexOf("\r")}`);
    var toBeParsed = event;
    var ircEvent = [];

    event.split("\r\n").forEach((ele, idx) => {
      if (ele.length > 0)
        ircEvent.push(format__line(ele));
    });
    console.log(`[${count}] messages Processed`, ircEvent);
  },

  formatWHISPER(event) {
    //carve out the formatting
  },

  formatPRIVMSG(event) {
    const parsed = {};

    const msg_parts = event.split('PRIVMSG ')[1];
    let split_msg_parts = msg_parts.split(' :');
    const channel = split_msg_parts[0];

    if(split_msg_parts.length >= 2) {
      split_msg_parts.shift();
    }
    const message = split_msg_parts.join(' :').replace(/\r\n/g, '');

    let  [tags,username] = event.split('PRIVMSG')[0].split(' :');
    parsed.username = username.split('!')[0];

    Object.assign(parsed,this.formatTAGS(tags));
    parsed.mod = !!parsed.mod;
    parsed.subscriber = !!parsed.subscriber;
    parsed.turbo = !!parsed.turbo;

    if(parsed.emote_only) parsed.emote_only = !!parsed.emote_only;

    parsed.channel = channel;
    parsed.message = message;

    return parsed;
  },

  formatCLEARCHAT(event) {
    const parsed = {};

    const msg_parts = event.split('CLEARCHAT ')[1];
    let split_msg_parts = msg_parts.split(' :');

    const channel = split_msg_parts[0];
    const target_username = split_msg_parts[1];

    let  [tags] = event.split('CLEARCHAT')[0].split(' :');
    Object.assign(parsed,this.formatTAGS(tags));

    if(parsed.ban_reason) {
      parsed.ban_reason = parsed.ban_reason.replace(/\\s/g, ' ');
    }

    if(parsed.ban_duration)
      parsed.type = 'timeout';
    else
      parsed.type = 'ban';

    parsed.channel = channel;
    if (target_username) {
      parsed.target_username = target_username.replace(/\r\n/g, '');
    }

    /* TODO: This needs a proper fix */
    parsed.tmi_sent_ts = parseInt(parsed.tmi_sent_ts);

    return parsed;
  },

  formatTAGS(tagstring) {
    let tagObject = {};
    const tags =tagstring.replace(/\s/g,' ').split(';');

    tags.forEach(tag => {
      const split_tag = tag.split('=');
      const name = this.formatTagName(split_tag[0]);
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
    if(tag.includes('-')) {
      tag = tag.replace(/-/g, '_');
    }
    if(tag.includes('@')) {
      tag = tag.replace('@', '');
    }
    return tag.trim();
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
