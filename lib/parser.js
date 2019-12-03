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
    /*
    Here is the general format for an individual tag:
      > @tag-name=<tag-name> :tmi.twitch.tv <command> #<channel> :<user>

      Split event on colon, the first element might be tags, if it is pop & parse it
      The next element is command info ALWAYS
      The next element is the content and can very based on command
    */


    var ircEvent = {
      event : event,
      toBeParsed : event,
      hasTags :  event.charAt(0) === '@'
    };

    ircEvent.tags = ircEvent.hasTags ? ircEvent.toBeParsed.split(' :').shift() : '';
    ircEvent.toBeParsed = ircEvent.toBeParsed.slice(ircEvent.tags.length); // removed the processed characters

    ircEvent.clientPrefix = ircEvent.toBeParsed.split(" ").shift();
    ircEvent.toBeParsed = ircEvent.toBeParsed.slice(ircEvent.clientPrefix.length); // removed the processed characters

    ircEvent.command = ircEvent.toBeParsed.split(" ").shift();
    ircEvent.toBeParsed = ircEvent.toBeParsed.slice(ircEvent.command.length); // removed the processed characters

    ircEvent.channel = ircEvent.toBeParsed.split(" ").shift();
    ircEvent.toBeParsed = ircEvent.toBeParsed.slice(ircEvent.channel.length); // removed the processed characters

    ircEvent.user = ircEvent.toBeParsed.split("\r\n").shift();
    ircEvent.toBeParsed = ircEvent.toBeParsed.slice(ircEvent.user.length); // removed the processed characters

    if(ircEvent.tags) {
      ircEvent.tags = ircEvent.tags.substr(1);      // drop the first character "@"
      ircEvent.tags = ircEvent.tags.split(';');     // turn the object from a string to an array
      ircEvent.tags.forEach((tag, idx) => {
        ircEvent.tags[tag.split('=')[1]] = tag.split('=')[0];
        delete ircEvent.tags[idx];
        console.log("tags", tag);
      });
      console.log("tags", ircEvent.tags);
      //console.log("tagsJSON", JSON.parse(tags));
    }

    console.log("ircEvent", ircEvent);


/*
    console.log("Colon-Space Split Event");
    var css_event = event.split(' :');
    for (var key in css_event) {
      if (css_event.hasOwnProperty(key)) {
        console.log(`[${key}]: ${css_event[key]}`);
      }
    }



    console.log("Semi-Colon Split SubEvent:");
    var scs_event = css_event[0].split(';');
    for (var key2 in scs_event) {
      if (scs_event.hasOwnProperty(key2)) {
        console.log(`[${key2}]: ${scs_event[key2]}`);
      }
    }*/
    //semicolonSplitEvent.pop();
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
