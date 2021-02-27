/**
 * 'Kindred invicta's Own Bot'
 * diedenieded
 */

const Discord = require('discord.js');
const client = new Discord.Client({ autoReconnect: true });
const dayjs = require('dayjs');
dayjs.extend(require('dayjs/plugin/duration'));
const DB = require('./DB');
const { duration } = require('dayjs');
const schedule = require('node-schedule');
var monthlyReset;

/**
 * Necessary global variables
 * VERBOSE - Toggles verbose output
 * db - json containing all information required
 * currentGuild - current Guild selected, will be using new Discord.Guild if not configured in db
 * 
 * db IS FOR DEVELOPMENT, db_production IS FOR PRODUCTION
 */
const VERBOSE = true;
var db = new DB('db.json');
// var db = new DB('db_production.json');
var currentGuild;
const RequiredPermissions = new Discord.Permissions([
    'VIEW_CHANNEL',
    'SEND_MESSAGES',
    'EMBED_LINKS',
    'MENTION_EVERYONE',
    'READ_MESSAGE_HISTORY'
]);

/**
 * Helper functions and variables below
 */
function verbose(log) {
    if (VERBOSE) console.log(dayjs().format('MM/DD/YY HH:mm:ss') + ' ' + log);
}

// Main code used to fetch members using provided IDs, create an embedded message and send to channel
function HoursHelperSendEmbed(tempIDs, channel, afterFunction) {
    currentGuild.members.fetch({ user: tempIDs })
        .then(users => {
            let tempEmbed = new Discord.MessageEmbed();
            let exists = true;
            let userThatDoesNotExist;
            tempEmbed.setColor('#fbec5d');
            tempEmbed.setAuthor(`${db.config.prefix}hours`);
            tempEmbed.setFooter(client.user.username, client.user.avatarURL());
            tempEmbed.setTimestamp();
            for (let i = 0; i < tempIDs.length; i++) {
                if (!db.users.exists(tempIDs[i])) {
                    exists = false;
                    userThatDoesNotExist = tempIDs[i];
                }
            }

            if (exists) {
                let tempUsers = users.sort((a, b) => {
                    let aSort = dayjs.duration(db.users.findByID(a.id).totalTime).asSeconds();
                    let bSort = dayjs.duration(db.users.findByID(b.id).totalTime).asSeconds();
                    return bSort - aSort;
                });
                let tempString = '';
                let tempNum = 0;
                verbose(`[HOURS] Fetching members from guild`);
                verbose(`[HOURS] Members fetched: `);
                tempUsers.each(member => {
                    tempNum++;
                    let tempDuration = dayjs.duration(0).add(db.users.findByID(member.id).totalTime);
                    let totalHours = (tempDuration.days() * 24) + tempDuration.hours();
                    verbose(`[HOURS] ${member.displayName}: ${totalHours}h ${tempDuration.format('mm[m ]ss[s]')}`);
                    tempString = tempString.concat(`**${tempNum}.** ${member.displayName} • **${totalHours}h ${tempDuration.format('mm[m ]ss[s]')}**\n`);
                });
                tempEmbed.setTitle('Total voice chat hours');
                tempEmbed.setDescription(tempString);
                channel.send(tempEmbed).then(() => {
                    verbose('[HOURS] Embedded message sent');
                }).catch(console.error);
            } else {
                tempEmbed.setTitle(`${currentGuild.members.cache.get(userThatDoesNotExist).displayName} does not have a record!`);
                verbose('[HOURS] Sending embed');
                channel.send(tempEmbed).then(() => {
                    verbose('[HOURS] Embedded message sent');
                }).catch(console.error);
            }
            if (afterFunction != undefined) {
                afterFunction();
            }
        }).catch(console.error);
}

// Force toIncrement to be updated with members currently in voice channels, useful when bot has disconnected and keeps counting
function scanVoiceChannels() {
    verbose('[KOB] Scanning for voice channels');
    toIncrement = [];
    currentGuild.channels.cache.filter(channel => channel.type === "voice").each(channel => {
        if (channel.id != currentGuild.afkChannelID && channel.members.size != 0) {
            verbose(`[KOB] Processing members in ${channel.name}`);
            channel.members.each(member => {
                if (!member.user.bot) {
                    verbose(`[KOB] Checking if user ${member.displayName} with ID ${member.id} exists in db`);
                    if (db.users.exists(member.id)) {
                        verbose(`[KOB] User found, adding user to toIncrement`);
                        toIncrement.push(db.users.findByID(member.id));
                        verbose(`[KOB] Contents of toIncrement: `);
                        toIncrement.forEach(user => { verbose(`[toIncrement] ${user.id}: ${user.totalTime}`) });
                    } else {
                        verbose(`[KOB] User does not exist, creating new user in DB`);
                        db.users.addUser(new DB.User(member.id, 'P0D'));
                        db.write();
                        verbose(`[KOB] Adding newly created user to toIncrement`);
                        toIncrement.push(db.users.findByID(member.id));
                        toIncrement.forEach(user => { verbose(`[toIncrement] ${user.id}: ${user.totalTime}`) });
                    }
                }
            });
        } else {
            verbose(`[KOB] ${channel.name} is empty, skipped`);
        }
    });
}

function monthlyHoursReset() {
    let channel = currentGuild.channels.resolve(db.config.announcementID);
    let tempUsers = [];
    let tempIDs = [];
    if (channel != null) {
        console.log('[KOB] Initiating monthly hours reset');
        channel.send('@everyone');
        let tempEmbed = new Discord.MessageEmbed()
            .setColor('#fbec5d')
            .setTitle('Monthly Voice Hours Reset')
            .setDescription(`Your voice hours has been reset. You can check your hours for ${dayjs().subtract(1, 'day').format('MMMM')} below`)
            .setFooter(client.user.username, client.user.avatarURL())
            .setTimestamp();
        channel.send(tempEmbed);
        tempUsers = JSON.parse(JSON.stringify(db.users.getArray())); // Deep copy
        tempUsers.forEach(user => {
            tempIDs.push(user.id);
        });
        currentGuild.members.fetch({ user: tempIDs }).then(users => {
            users.each(user => {
                verbose('[KOB] Removing role for ' + user.displayName);
                user.roles.remove(db.config.ranks[0]);
                user.roles.remove(db.config.ranks[1]);
                user.roles.remove(db.config.ranks[2]);
                user.roles.remove(db.config.ranks[3]);
                user.roles.remove(db.config.ranks[4]);
                user.roles.remove(db.config.ranks[5]);
            });
        });
        HoursHelperSendEmbed(tempIDs, channel, () => {
            db.users.clearUsers();
            db.write();
            scanVoiceChannels();
        });
    }
}

function setRole(userID, roleID) {
    currentGuild.members.fetch(userID).then(user => {
        verbose('[KOB] Setting role for ' + user.displayName);
        user.roles.add(roleID);
    });
}

function removeRole(userID, roleID) {
    currentGuild.members.fetch(userID).then(user => {
        verbose('[KOB] Removing role for ' + user.displayName);
        user.roles.remove(roleID);
    });
}

function directMessage(userID, message) {
    client.users.fetch(userID)
        .then(user => {
            user.createDM()
                .then(dm => {
                    dm.send(message)
                        .catch(err => {
                            console.log(`[KOB] Unable to direct message ${user.username}, bot may have been blocked.`);
                            verbose(err);
                        });
                });

        });
}

/**
 * client events below
 */

/**
 * Initialize here, mind async discord functions
 */
client.on('ready', () => {
    client.user.setActivity(`${db.config.prefix}help`)
        .then(verbose(`[KOB] Bot activity set to ${db.config.prefix}help`))
        .catch(console.error);
    verbose(`[KOB] Reading guild ID: ${db.config.guildID}`);
    if (db.config.guildID == '-1') {
        verbose('[KOB] Guild ID not configured in db, using new Discord.Guild');
        currentGuild = new Discord.Guild();
        console.log('[KOB] Bot is ready!');
    } else {
        client.guilds.fetch(db.config.guildID, true, true) // Cache guild, skip cache check
            .then((guild) => {
                currentGuild = guild;
                console.log(`[KOB] Guild selected: ${currentGuild.name}`);
                currentGuild.members.fetch(client.user.id).then(user => {
                    verbose(`[KOB] Does bot have required permissions?: ${user.permissions.has(RequiredPermissions)}`);
                    console.log('[KOB] Bot is ready!');
                    monthlyReset = schedule.scheduleJob('0 0 1 * *', monthlyHoursReset);
                    scanVoiceChannels();
                });
            })
            .catch((err) => { console.log(err); });
    }
});

// Connection loss
client.on('shardError', (err) => {
    verbose('[KOB] ' + err);
    console.log('[KOB] KOB thinks connection is lost, toIncrement has been cleared');
    toIncrement = [];
});

// Connection back
client.on('shardResume', () => {
    console.log('[KOB] Reconnected successfully');
    client.user.setActivity(`${db.config.prefix}help`)
        .then(() => {
            verbose(`[KOB] Bot activity set to ${db.config.prefix}help`);
            scanVoiceChannels();
        })
        .catch(console.error);
});


/**
 * client.on('message') processing structure
 * Check prefix -> substr w/o prefix and cmd only -> check cmd ->
 * substr w/o cmd and args only, redirect to cmd's related branch ->
 * process args in cmd's related branch
 * e.g.
 * !voicehours all -> voicehours all -> all
 */
client.on('message', message => {
    if (message.content.charAt(0) == db.config.prefix) {
        let command;
        let args;

        //#region Command processing
        let spaceBeforeArgs = message.content.indexOf(' ');
        if (spaceBeforeArgs == -1) {
            command = message.content.substring(1);
            args = null;
        } else {
            verbose(`[KOB] Index of first space after command: ${spaceBeforeArgs}`);
            command = message.content.substring(1, spaceBeforeArgs);
            args = message.content.substring(spaceBeforeArgs + 1);
        }
        console.log(`[KOB] ${message.content}`);
        verbose(`[KOB] -- Prefix: ${message.content.charAt(0)}`);
        verbose(`[KOB] -- Command: ${command}`);
        verbose(`[KOB] -- Args: ${args}`);
        verbose(`[KOB] -- Channel: ${message.channel.name}`);
        verbose(`[KOB] -- Author: ${message.author.username}`);
        //#endregion

        switch (command) {
            case 'ping':
                var ping = client.ws.ping;
                console.log(`[PING] ${ping}ms`);
                message.reply(`pong!, ${ping}ms`);
                break;
            case 'prefix':
                if (args) {
                    if (args.length != 1) {
                        console.log('[PREFIX] Prefix must have a length of 1');
                        message.reply('prefix must have length of 1');
                    } else {
                        console.log(`[PREFIX] Setting prefix to ${args}`);
                        message.reply(`prefix has been changed to ${args}`);
                        db.config.prefix = args;
                        db.write();
                    }
                } else {
                    console.log('[PREFIX] Prefix cannot be null!');
                    message.reply('please enter a prefix!');
                }
                break;
            case 'hours':
                let tempUsers = [];
                let tempIDs = [];
                verbose(`[HOURS] Number of users mentioned: ${message.mentions.users.size}`);
                if (message.mentions.users.size == 0) {
                    // Print all hours
                    verbose(`[HOURS] Therefore, displaying all users`);
                    tempUsers = JSON.parse(JSON.stringify(db.users.getArray())); // Deep copy
                    verbose(`[HOURS] Contents of tempUsers:`);
                    tempUsers.forEach(user => {
                        verbose(`[HOURS] ${user.id}`);
                        tempIDs.push(user.id);
                    });
                    HoursHelperSendEmbed(tempIDs, message.channel);
                } else if (message.mentions.users.size > 0) {
                    // Print hour of mentioned users
                    verbose(`[HOURS] Thereforem displaying mentioned users`);
                    message.mentions.users.each(user => tempIDs.push(user.id));
                    HoursHelperSendEmbed(tempIDs, message.channel);
                }
                break;
            case 'help':
                let tempEmbed = new Discord.MessageEmbed();
                tempEmbed.setAuthor(`${db.config.prefix}help`);
                tempEmbed.setTitle('Help');
                tempEmbed.setFooter(client.user.username, client.user.avatarURL());
                tempEmbed.setTimestamp();
                tempEmbed.setColor('#fbec5d');
                tempEmbed.addFields(
                    { name: `${db.config.prefix}hours [user...]`, value: 'Displays the total voice chat members. Arguments can either be empty to show all members\'s hours, or @user to show that user\'s hours' },
                    { name: `${db.config.prefix}ping`, value: 'Pong! Shows average latency between KOB and you' },
                    { name: `${db.config.prefix}prefix [symbol]`, value: 'Sets the prefix to bot commands. MUST BE ONE SYMBOL LONG!' },
                    { name: `${db.config.prefix}setguild`, value: 'Sets the current guild as the bot\'s active guild. Can only be used once when initially setting up the bot' },
                    { name: `${db.config.prefix}setannouncement [channel id]`, value: 'Sets the announcement channel for bot to send announcements' }
                );
                verbose('[HELP] Sending embed');
                message.channel.send(tempEmbed);
                break;
            case 'setguild':
                if (db.config.guildID == -1) {
                    currentGuild = message.guild;
                    db.config.guildID = message.guild.id;
                    db.write();
                    console.log(`[KOB] New guild has been set! - ${message.guild.name}: ${message.guild.id}`);
                    message.reply(`guild has been set to ${message.guild.name}!`);
                } else {
                    message.reply('guild has already been set. You cannot change it anymore!');
                }
                break;
            case 'setannouncement':
                if (args != null) {
                    let tempChannel;
                    tempChannel = currentGuild.channels.resolve(args);
                    if (tempChannel != null) {
                        db.config.announcementID = args;
                        db.write();
                        message.reply(`the announcement channel has been set to "${tempChannel.name}".`);
                        console.log(`[KOB] Announcment channel has been set to ${tempChannel.name}`);
                    } else {
                        message.reply('this channel is not valid!');
                    }
                }
                break;
            case 'dm': {
                directMessage(message.author.id, "Test");
            }
        }
    }
});


/**
 * client.on('voiceStateUpdate', (old, new))
 * To connect, old state's id is either null or afk channel's
 * To disconnect, new state's id is either null or afk channel's
 */
client.on('voiceStateUpdate', (oldVoiceState, newVoiceState) => {
    // verbose(`[KOB] Old: ${oldVoiceState.channelID}, New: ${newVoiceState.channelID}`);
    // Really melted my brain on these two ifs
    if (!newVoiceState.member.user.bot) {
        if ((oldVoiceState.channelID == null || (oldVoiceState.channelID == currentGuild.afkChannelID && newVoiceState.channelID != null))
            && newVoiceState.channelID != currentGuild.afkChannelID) {
            // Connect procedure
            console.log(`[KOB] ${newVoiceState.member.displayName} has connected`);
            verbose('[KOB] Carrying out connect procedure');
            verbose(`[KOB] Checking if user ${newVoiceState.member.displayName} with ID ${newVoiceState.member.id} exists in db`);
            if (db.users.exists(newVoiceState.member.id)) {
                verbose(`[KOB] User found, adding user to toIncrement`);
                toIncrement.push(db.users.findByID(newVoiceState.member.id));
                verbose(`[KOB] Contents of toIncrement: `);
                toIncrement.forEach(user => { verbose(`[toIncrement] ${user.id}: ${user.totalTime}`) });
            } else {
                verbose(`[KOB] User does not exist, creating new user in DB`);
                db.users.addUser(new DB.User(newVoiceState.member.id, 'P0D'));
                db.write();
                verbose(`[KOB] Adding newly created user to toIncrement`);
                toIncrement.push(db.users.findByID(newVoiceState.member.id));
                toIncrement.forEach(user => { verbose(`[toIncrement] ${user.id}: ${user.totalTime}`) });
            }
        }
        if ((oldVoiceState.channelID != currentGuild.afkChannelID && newVoiceState.channelID == null) || (newVoiceState.channelID == currentGuild.afkChannelID && oldVoiceState.channelID != null)) {
            // Disconnect procedure
            verbose('[KOB] Carrying out disconnect procedure');
            verbose(`[KOB] Checking if user with ID ${newVoiceState.member.id} exists in toIncrement`);
            let tempIndex = toIncrement.findIndex(elm => elm.id == newVoiceState.member.id);
            if (tempIndex != -1) {
                verbose(`[KOB] User with ID ${newVoiceState.member.id} exists at index ${tempIndex} in toIncrement, removing...`);
                toIncrement.splice(tempIndex, 1);
                verbose(`[KOB] User with ID ${newVoiceState.member.id} has been removed.`);
                toIncrement.forEach(user => { if (toIncrement.length > 0) verbose(`[toIncrement] ${user.id}: ${user.totalTime}`) });
            } else {
                verbose(`[KOB] User with ID ${newVoiceState.member.id} does not exist in toIncrement, ignored`);
            }
        }
    }
});


/**
 * toIncrement - this array contains users whose time needs to be incremented by
 * interval function below
 */
var toIncrement = [];


/**
 * This function increments the time of users in toIncrement[]
 */
var verboseMessageLimit = 0;
setInterval(() => {
    verboseMessageLimit++;
    toIncrement.forEach(user => {
        if (toIncrement.length > 0) {
            let tempDuration = new dayjs.duration(user.totalTime);
            tempDuration = tempDuration.add(5, 'seconds');
            // tempDuration = tempDuration.add('10', 'hours');
            // Assignment role
            switch (tempDuration.asHours()) {
                case 10:
                    if (tempDuration.seconds() == 0) {
                        setRole(user.id, db.config.ranks[5]);
                        directMessage(user.id, `Congratulations <@${user.id}>, you've been promoted to **${currentGuild.roles.resolve(db.config.ranks[5]).name}** on **${currentGuild.name}**!`);
                    }
                    break;
                case 20:
                    if (tempDuration.seconds() == 0) {
                        setRole(user.id, db.config.ranks[4]);
                        removeRole(user.id, db.config.ranks[5]);
                        directMessage(user.id, `Congratulations <@${user.id}>, you've been promoted to **${currentGuild.roles.resolve(db.config.ranks[4]).name}** on **${currentGuild.name}**!`);
                    }
                    break;
                case 30:
                    if (tempDuration.seconds() == 0) {
                        setRole(user.id, db.config.ranks[3]);
                        removeRole(user.id, db.config.ranks[4]);
                        directMessage(user.id, `Congratulations <@${user.id}>, you've been promoted to **${currentGuild.roles.resolve(db.config.ranks[3]).name}** on **${currentGuild.name}**!`);
                    }
                    break;
                case 40:
                    if (tempDuration.seconds() == 0) {
                        setRole(user.id, db.config.ranks[2]);
                        removeRole(user.id, db.config.ranks[3]);
                        directMessage(user.id, `Congratulations <@${user.id}>, you've been promoted to **${currentGuild.roles.resolve(db.config.ranks[2]).name}** on **${currentGuild.name}**!`);
                    }
                    break;
                case 50:
                    if (tempDuration.seconds() == 0) {
                        setRole(user.id, db.config.ranks[1]);
                        removeRole(user.id, db.config.ranks[2]);
                        directMessage(user.id, `Congratulations <@${user.id}>, you've been promoted to **${currentGuild.roles.resolve(db.config.ranks[1]).name}** on **${currentGuild.name}**!`);
                    }
                    break;
                case 60:
                    if (tempDuration.seconds() == 0) {
                        setRole(user.id, db.config.ranks[0]);
                        removeRole(user.id, db.config.ranks[1]);
                        directMessage(user.id, `Congratulations <@${user.id}>, you've been promoted to **${currentGuild.roles.resolve(db.config.ranks[0]).name}** on **${currentGuild.name}**!`);
                    }
                    break;
                default:
                    break;
            }

            user.totalTime = tempDuration.toJSON();
            if (verboseMessageLimit == 10) {
                verbose(`[KOB] Incrementing ${toIncrement.length} users' totalTime by 60 seconds`);
                verboseMessageLimit = 0;
            }
        }
    });
    db.write();
}, 5000);

client.login(db.config.token);