/**
 * diedenieded-bot
 * diedenieded
 */
const version = "v2021-06-12-0004";
const Discord = require('discord.js');
const client = new Discord.Client({ autoReconnect: true, partials: ["USER", "CHANNEL", "GUILD_MEMBER", "MESSAGE", "REACTION"] });
const dayjs = require('dayjs');
dayjs.extend(require('dayjs/plugin/duration'));
const DB = require('./DB');
const schedule = require('node-schedule');
const nodeEmoji = require('node-emoji');
const e = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
var monthlyReset, weeklyReset;
const defaultEmbedColor = '#27e9e9';

/**
 * Necessary global variables
 * VERBOSE - Toggles verbose output
 * db - json containing all information of a server
 * currentGuild - current Guild selected, will be using new Discord.Guild if not configured in db
 * toIncrement - this array contains users whose time needs to be incremented, contains GuildMember type
 */
const VERBOSE = true;
const ENABLE_CONTROL_PANEL = true;
const AUTO_DELETE_REACT_MESSAGES = true;
var db = new DB('db.json');
/**
 * Helper functions and variables below
 */

function verbose(log) {
    if (VERBOSE) console.log(dayjs().format('MM/DD/YY HH:mm:ss') + ' ' + log);
}

var currentGuild;
const RequiredPermissions = new Discord.Permissions([
    'VIEW_CHANNEL',
    'SEND_MESSAGES',
    'EMBED_LINKS',
    'MENTION_EVERYONE',
    'READ_MESSAGE_HISTORY'
]);
var toIncrement = [];
var botDisplayName;
// React messages are fetched on startup, when it fails said messages
// are assumed to be deleted and added to deletedReactMessages
var deletedReactMessages = [];

//#region Disable this region to disable client activities
// Main code used to fetch members using provided IDs, create an embedded message and send to channel
function HoursHelperSendEmbed(tempIDs, channel, afterFunction) {
    currentGuild.members.fetch({ user: tempIDs })
        .then(users => {
            let tempEmbed = new Discord.MessageEmbed();
            let exists = true;
            let userThatDoesNotExist;
            tempEmbed.setColor(defaultEmbedColor);
            tempEmbed.setAuthor(`${db.config.prefix}hours`);
            tempEmbed.setFooter(botDisplayName, client.user.avatarURL());
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
                    let tempDBmember = db.users.findByID(member.id);
                    if (tempDBmember.totalTime == 'PT0D') {
                        tempDBmember.totalTime = 'PT0S'; // Sloppy fix for NaNs, which are caused by new users with invalid time strings
                        db.write();
                    }
                    let tempDuration = dayjs.duration(0).add(db.users.findByID(member.id).totalTime);
                    if (tempDuration.asMilliseconds() > 0) {
                        tempNum++;
                        let totalHours = (tempDuration.days() * 24) + tempDuration.hours();
                        let rank = '';
                        if (tempNum == 1) {
                            rank = '🥇';
                        } else if (tempNum == 2) {
                            rank = '🥈';
                        } else if (tempNum == 3) {
                            rank = '🥉';
                        } else {
                            rank = `**${tempNum}.**`;
                        }
                        verbose(`[HOURS] ${member.displayName}: ${totalHours}h ${tempDuration.format('mm[m ]ss[s]')}`);
                        tempString = tempString.concat(`${rank} ${member.displayName} • **${totalHours}h ${tempDuration.format('mm[m ]ss[s]')}**\n`);
                    }
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

function HoursImageSend(tempIDs, authorID, channel) {
    verbose(`HoursImageSend(${tempIDs}, ${authorID}, ${channel})`);
    currentGuild.members.fetch({ user: tempIDs }).then(users => {
        // Filter users with less than 5 seconds of voice time
        let filteredUsers = users.filter(user => {
            let tempDuration = dayjs.duration(0).add(db.users.findByID(user.id).totalTime);
            if (tempDuration.asMilliseconds() > 0) {
                return true;
            } else {
                return false;
            }
        });

        let sortedUsersCollection = filteredUsers.sort((a, b) => {
            let aSort = dayjs.duration(db.users.findByID(a.id).totalTime).asSeconds();
            let bSort = dayjs.duration(db.users.findByID(b.id).totalTime).asSeconds();
            return bSort - aSort;
        });

        // Convert Discord.Collection into an Array
        let sortedUsers = [];
        sortedUsersCollection.each(user => {
            sortedUsers.push(user);
        });

        let html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <title>Hours</title>
            <link rel="stylesheet" href="hours.css">
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;700&display=swap" rel="stylesheet">
        </head>
        <body>
            <div class="main">
                <div class="header">
                    <div class="title">Voice Hours</div>
                    <div class="info"><span id="prefix">${db.config.prefix}</span>hoursAll for old list</div>
                </div>
                <div class="entries">
        `;

        let retrieveLength;

        if (sortedUsers.length < 5) {
            // If less than 5 users, use all users
            retrieveLength = sortedUsers.length;
        } else {
            // Otherwise get top 5
            retrieveLength = 5;
        }

        // Check if author belongs to top 5
        let authorIndex = sortedUsers.findIndex(user => user.id == authorID);
        let authorTop;

        if (authorIndex < 5) {
            // If author is in top 5, retrieve length is 5
            authorTop = true;
            verbose('[HOURS] Author is in top 5');
        } else {
            // If author is not in top 5, retrieve length is 4
            // Then author will be separately retrieved and added to end
            authorTop = false
            retrieveLength = 4;
            verbose('[HOURS] Author is not in top 5');
        }

        for (let i = 0; i < retrieveLength; i++) {
            const user = sortedUsers[i];
            let name = user.displayName;
            let tag = user.user.discriminator;
            let rank = i + 1;
            let duration = dayjs.duration(0).add(db.users.findByID(user.id).totalTime);
            let hours = (duration.days() * 24) + duration.hours();
            let minutes = duration.minutes();
            let seconds = duration.seconds();
            let imageURL = user.user.displayAvatarURL({
                format: 'webp',
                dynamic: true,
                size: 128
            });

            verbose(`[HOURS] Processing user: ${name}#${tag}`);
            verbose(`[HOURS] ${hours} ${minutes} ${seconds}`);

            if (authorIndex == i) {
                html += `<div class="large-entry`;

                if (rank > 3) {
                    html += ` selected `;
                }
            } else {
                html += `<div class="small-entry`;
            }

            switch (rank) {
                case 1:
                    html += ` gold">`;
                    break;
                case 2:
                    html += ` silver">`;
                    break;
                case 3:
                    html += ` bronze">`;
                    break;
                default:
                    html += `">`;
                    break;
            }

            html += `<img src="${imageURL}">`;

            html += `
                <div class="name-tag">
                    <div class="name">${name}</div>
                    <div class="tag">#${tag}</div>
                </div>`;

            html += `
                <div class="time">
                    <div class="hours">
                        <div class="t-val">${hours}</div>
                        <div class="t-pre">h</div>
                    </div>
                    <div class="minutes">
                        <div class="t-val">${minutes}</div>
                        <div class="t-pre">m</div>
                    </div>
                    <div class="seconds">
                        <div class="t-val">${seconds}</div>
                        <div class="t-pre">s</div>
                    </div>
                </div>
                <div class="rank">${rank}</div>`;

            html += '</div>';
        }

        if (!authorTop) {
            const user = sortedUsers[authorIndex];
            let name = user.displayName;
            let tag = user.user.discriminator;
            let rank = authorIndex + 1;
            let duration = dayjs.duration(0).add(db.users.findByID(user.id).totalTime);
            let hours = (duration.days() * 24) + duration.hours();
            let minutes = duration.minutes();
            let seconds = duration.seconds();
            let imageURL = user.user.displayAvatarURL({
                format: 'webp',
                dynamic: true,
                size: 128
            });

            verbose(`[HOURS] Processing user: ${name}#${tag}`);
            verbose(`[HOURS] ${hours} ${minutes} ${seconds}`);

            html += `
            <div class="large-entry selected">
                <img src="${imageURL}">
                <div class="name-tag">
                    <div class="name">${name}</div>
                    <div class="tag">#${tag}</div>
                </div>
                <div class="time">
                    <div class="hours">
                        <div class="t-val">${hours}</div>
                        <div class="t-pre">h</div>
                    </div>
                    <div class="minutes">
                        <div class="t-val">${minutes}</div>
                        <div class="t-pre">m</div>
                    </div>
                    <div class="seconds">
                        <div class="t-val">${seconds}</div>
                        <div class="t-pre">s</div>
                    </div>
                </div>
                <div class="rank">${rank}</div>
            </div>
            `;
        }

        html += `
        </div>
        </div>
        </body>
        </html>
        `;

        fs.writeFileSync('data/hours.html', html);
        htmlToImage('data/hours.html').then(() => {
            channel.send({
                files: [
                    './hours.png'
                ]
            }).then(verbose('[HOURS] Image sent'));
        });
    });
}

async function htmlToImage(htmlPath) {
    let browser = await puppeteer.launch({
        headless: true,
        defaultViewport: {
            width: 500,
            height: 445,
            isLandscape: false,
            deviceScaleFactor: 2
        },
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    }).then(verbose('[HTML2IMG] Browser started'));
    let page = await browser.newPage();
    await page.goto(`file://${__dirname}/data/hours.html`, {
        waitUntil: 'load'
    }).then(verbose('[HTML2IMG] Page Loaded'));
    await page.screenshot({
        path: 'hours.png'
    }).then(verbose('[HTML2IMG] Page screnshotted'));

    await browser.close().then(verbose('[HTML2IMG] Browser closed'));
}

// Force toIncrement to be updated with members currently in voice channels, useful when bot has disconnected and keeps counting
function scanVoiceChannels() {
    verbose('[DBOT] Scanning for voice channels');
    toIncrement = [];
    currentGuild.channels.cache.filter(channel => channel.type === "voice").each(channel => {
        if (channel.id != currentGuild.afkChannelID && channel.members.size != 0) {
            verbose(`[DBOT] Processing members in ${channel.name}`);
            channel.members.each(member => {
                if (!member.user.bot) {
                    verbose(`[DBOT] Checking if user ${member.displayName} with ID ${member.id} exists in db`);
                    if (db.users.exists(member.id)) {
                        verbose(`[DBOT] User found, adding user to toIncrement`);
                        //toIncrement.push(db.users.findByID(member.id));
                        toIncrement.push(member);
                        verbose(`[DBOT] Contents of toIncrement: `);
                        toIncrement.forEach(member => { verbose(`[toIncrement] ${member.displayName}: ${db.users.findByID(member.id).totalTime}`) });
                    } else {
                        verbose(`[DBOT] User does not exist, creating new user in DB`);
                        db.users.addUser(new DB.User(member.id, 'P0D'));
                        db.write();
                        verbose(`[DBOT] Adding newly created user to toIncrement`);
                        //toIncrement.push(db.users.findByID(member.id));
                        toIncrement.push(member);
                        toIncrement.forEach(user => { verbose(`[toIncrement] ${member.displayName}: ${db.users.findByID(member.id).totalTime}`) });
                    }
                }
            });
        } else {
            verbose(`[DBOT] ${channel.name} is empty, skipped`);
        }
    });
}

// Used to trigger monthly hours reset, scheduled in initialization
function monthlyHoursReset() {
    let channel = currentGuild.channels.resolve(db.config.announcementID);
    let tempUsers = [];
    let tempIDs = [];
    if (channel != null) {
        console.log('[DBOT] Initiating monthly hours reset');
        channel.send('@everyone');
        let tempEmbed = new Discord.MessageEmbed()
            .setColor(defaultEmbedColor)
            .setTitle('Monthly Voice Hours Reset')
            .setDescription(`Your voice hours has been reset. You can check your hours for ${dayjs().subtract(1, 'day').format('MMMM')} below`)
            .setFooter(botDisplayName, client.user.avatarURL())
            .setTimestamp();
        channel.send(tempEmbed);
        tempUsers = JSON.parse(JSON.stringify(db.users.getArray())); // Deep copy
        tempUsers.forEach(user => {
            tempIDs.push(user.id);
        });
        currentGuild.members.fetch({ user: tempIDs }).then(users => {
            users.each(user => {
                verbose('[DBOT] Removing role for ' + user.displayName);
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

function weeklyHoursReset() {
    db.week = new DB.Week();
    db.write();
}

function setRole(userID, roleID, callback) {
    currentGuild.members.fetch(userID).then(user => {
        verbose('[DBOT] Setting role for ' + user.displayName);
        user.roles.add(roleID);
    }).finally(() => {
        if (callback) {
            callback();
        }
    });
}

function removeRole(userID, roleID, callback) {
    currentGuild.members.fetch(userID).then(user => {
        verbose('[DBOT] Removing role for ' + user.displayName);
        user.roles.remove(roleID);
    }).finally(() => {
        if (callback) {
            callback();
        }
    });
}

function directMessage(userID, message) {
    client.users.fetch(userID)
        .then(user => {
            user.createDM()
                .then(dm => {
                    dm.send(message)
                        .catch(err => {
                            console.log(`[DBOT] Unable to direct message ${user.username}, bot may have been blocked.`);
                            verbose(err);
                        });
                });

        });
}

function fetchReactMessages() {
    db.reactMessages.forEach(reactMessage => {
        currentGuild.channels.resolve(reactMessage.channel).fetch(true).then(channel => {
            // Fetching and caching so it can be resolved later
            let msgCount = 0;
            channel.messages.fetch(reactMessage.id, true, true).then(message => {
                msgCount++;
            }).catch(err => {
                console.log(`[DBOT] Failed to fetch message ${reactMessage.id}, delete message from db: ${AUTO_DELETE_REACT_MESSAGES}`);
                deletedReactMessages.push(reactMessage.id);
                verbose(err);
            }).finally(() => {
                verbose(`[DBOT] Fetched ${msgCount} messages for react roles`);
                if (AUTO_DELETE_REACT_MESSAGES) {
                    deletedReactMessages.forEach(message => {
                        let index = db.reactMessages.findIndex(msg => msg.id == message);
                        db.reactMessages.splice(index, 1);
                        db.write();
                    });
                }
            });
        });
    });
}



/****************************************
 *                                      *
 *                                      *
 * CLIENT EVENTS BELOW                  *
 *                                      *
 *                                      *
 ****************************************/

/**
 * Initialize here, mind async discord functions
 */
client.on('ready', () => {
    client.user.setActivity(`${db.config.prefix}help`)
        .then(verbose(`[DBOT] Bot activity set to ${db.config.prefix}help`))
        .catch(console.error);
    verbose(`[DBOT] Reading guild ID: ${db.config.guildID}`);
    if (db.config.guildID == '-1') {
        verbose('[DBOT] Guild ID not configured in db, using new Discord.Guild');
        currentGuild = new Discord.Guild();
        console.log('[DBOT] Bot is ready!');
    } else {
        client.guilds.fetch(db.config.guildID, true, true) // Cache guild, skip cache check
            .then((guild) => {
                currentGuild = new Discord.Guild;
                currentGuild = guild;
                console.log(`[DBOT] Guild selected: ${currentGuild.name}`);
                currentGuild.members.fetch(client.user.id).then(user => {
                    verbose(`[DBOT] Does bot have required permissions?: ${user.permissions.has(RequiredPermissions)}`);
                    console.log('[DBOT] Bot is ready!');
                    monthlyReset = schedule.scheduleJob('0 0 1 * *', monthlyHoursReset);
                    weeklyReset = schedule.scheduleJob('0 0 * * 1', weeklyHoursReset);
                    scanVoiceChannels();
                    botDisplayName = user.displayName;
                });
                // Fetch channels and messages for react roles
                fetchReactMessages();
            })
            .catch((err) => { console.log(err); });
    }
});

// Connection loss
client.on('shardReconnecting', (err) => {
    console.log('[DBOT] DBOT thinks connection is lost, toIncrement has been cleared');
    toIncrement = [];
});

// Connection back
client.on('shardResume', () => {
    console.log('[DBOT] Reconnected successfully');
    client.user.setActivity(`${db.config.prefix}help`)
        .then(() => {
            verbose(`[DBOT] Bot activity set to ${db.config.prefix}help`);
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
        let isAdministrator = false;

        //#region Command processing
        let spaceBeforeArgs = message.content.indexOf(' ');
        if (spaceBeforeArgs == -1) {
            command = message.content.substring(1);
            args = null;
        } else {
            verbose(`[DBOT] Index of first space after command: ${spaceBeforeArgs}`);
            command = message.content.substring(1, spaceBeforeArgs);
            args = message.content.substring(spaceBeforeArgs + 1);
        }

        verbose(`[DBOT] -- Prefix: ${message.content.charAt(0)}`);
        verbose(`[DBOT] -- Command: ${command}`);
        verbose(`[DBOT] -- Args: ${args}`);
        verbose(`[DBOT] -- Channel: ${message.channel.name}`);
        verbose(`[DBOT] -- Author: ${message.author.username}`);
        //#endregion

        //#region Check if user is administrator
        message.member.hasPermission('ADMINISTRATOR');
        isAdministrator = message.member.hasPermission('ADMINISTRATOR');
        verbose(`[DBOT] ${message.member.displayName} has administrator permissions?: ${isAdministrator}`);
        //#endregion

        switch (command) {
            case 'ping':
                var ping = client.ws.ping;
                console.log(`[PING] ${ping}ms`);
                message.reply(`pong!, ${ping}ms`);
                break;
            case 'prefix':
                if (!isAdministrator) {
                    message.reply('you do not have permission to use this command.');
                    break;
                }
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
                if (db.users.exists(message.author.id)) {
                    verbose(`[HOURS] ${message.author.username} has entry in db`);
                    let tUsers = [];
                    let tID = [];
                    verbose(`[HOURS] Displaying hours image`);
                    tUsers = JSON.parse(JSON.stringify(db.users.getArray())); // Deep copy
                    verbose(`[HOURS] Contents of tUsers:`);

                    tUsers.forEach(user => {
                        verbose(`[HOURS] ${user.id}`);
                        tID.push(user.id);
                    });
                    HoursImageSend(tID, message.author.id, message.channel);
                } else {
                    verbose(`[HOURS] ${message.author.username} does not have entry in db`);
                    message.reply(`you do not have any voice hours accumulated! Use ${db.config.prefix}hoursAll to view everyone's voice hours`);
                }
                break;

            case 'hoursAll':
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
                    verbose(`[HOURS] Therefore displaying mentioned users`);
                    message.mentions.users.each(user => tempIDs.push(user.id));
                    HoursHelperSendEmbed(tempIDs, message.channel);
                }
                break;

            case 'help':
                let tempEmbed = new Discord.MessageEmbed();
                tempEmbed.setAuthor(`${db.config.prefix}help`);
                tempEmbed.setTitle('Help');
                tempEmbed.setFooter(botDisplayName, client.user.avatarURL());
                tempEmbed.setTimestamp();
                tempEmbed.setColor(defaultEmbedColor);
                tempEmbed.addFields(
                    { name: `${db.config.prefix}hours`, value: 'Displays the total voice hours of a member' },
                    { name: `${db.config.prefix}hoursAll`, value: 'Displays the total voice hours of all members' },
                    { name: `${db.config.prefix}ping`, value: `Pong! Shows average latency between ${botDisplayName} and you` },
                );
                if (isAdministrator) {
                    tempEmbed.addFields(
                        { name: `${db.config.prefix}prefix [symbol]`, value: 'Sets the prefix to bot commands. MUST BE ONE SYMBOL LONG!' },
                        { name: `${db.config.prefix}setannouncement [channel id]`, value: 'Sets the announcement channel for bot to send announcements' },
                        { name: `${db.config.prefix}mention [#channel] [user, role or everyone]`, value: 'Mentions specified people' },
                        { name: `${db.config.prefix}msgchannel [#channel] [message]`, value: 'Sends a message to the specified channel' }
                    );
                }

                verbose('[HELP] Sending embed');
                message.channel.send(tempEmbed);
                break;
            case 'setannouncement':
                if (!isAdministrator) {
                    message.reply('you do not have permission to use this command');
                    break;
                }
                if (args != null) {
                    let tempChannel;
                    tempChannel = currentGuild.channels.resolve(args);
                    if (tempChannel != null) {
                        db.config.announcementID = args;
                        db.write();
                        message.reply(`the announcement channel has been set to "${tempChannel.name}".`);
                        console.log(`[DBOT] Announcment channel has been set to ${tempChannel.name}`);
                    } else {
                        message.reply('this channel is not valid!');
                    }
                }
                break;
            // case 'dm':
            //     if (!isAdministrator) {
            //         message.reply('you do not have permission to use this command');
            //         break;
            //     }
            //     directMessage(message.author.id, "Test");
            //     break;
            case 'mention':
                if (!isAdministrator) {
                    message.reply('you do not have permission to use this command');
                    break;
                }
                if (args) {
                    if (args.length == 0) {
                        message.reply('you need to choose a channel and mention users or roles');
                        break;
                    }
                } else {
                    message.reply('you need to choose a channel and mention users or roles');
                    break;
                }

                let channel;
                if (message.mentions.channels.first()) {
                    channel = message.mentions.channels.first();
                } else {
                    let channelID = args.substring(0, args.indexOf(' '));
                    channel = currentGuild.channels.resolve(channelID);
                    // console.log(channelID);
                    if (!channel) {
                        message.reply('invalid channel ID!');
                        break;
                    }
                }

                console.log(message.mentions.everyone);
                if (message.mentions.everyone) {
                    channel.send('@everyone');
                } else if (message.mentions.users.size == 0 && message.mentions.roles.size == 0) {
                    message.reply('you need to mention users or roles');
                } else {
                    let mentions = '';
                    message.mentions.users.each(user => {
                        mentions += `<@!${user.id}> `;
                    });
                    message.mentions.roles.each(role => {
                        mentions += `<@&${role.id}> `;
                    });
                    console.log(mentions);
                    channel.send(mentions);
                }
                break;

            case 'msgchannel':
                if (!isAdministrator) {
                    message.reply('you do not have permission to use this command');
                    break;
                }

                if (args) {
                    if (args.length == 0) {
                        message.reply('you need to choose a channel and mention users or roles');
                        break;
                    }
                } else {
                    message.reply('you need to choose a channel and mention users or roles');
                    break;
                }

                let ch;
                if (message.mentions.channels.first()) {
                    ch = message.mentions.channels.first();
                } else {
                    let channelID = args.substring(0, args.indexOf(' '));
                    ch = currentGuild.channels.resolve(channelID);
                    // console.log(channelID);
                    if (!ch) {
                        message.reply('invalid channel ID!');
                        break;
                    }
                }

                let string = '';
                let arr = args.split(' ');
                for (let i = 1; i < arr.length; i++) {
                    string += arr[i];
                    if ((i + 1) != arr.length) {
                        string += ' ';
                    }
                }
                console.log(string);
                ch.send(string);
                break;

            case 'test':
                if (!isAdministrator) {
                    message.reply('you do not have permission to use this command');
                    break;
                }
                let embed = new Discord.MessageEmbed();
                embed.setDescription(':TEST: :female_sign:');
                message.channel.send(embed);
                break;
            default:
                message.reply(`command doesn't exist, use ${db.config.prefix}help to view available commands`);
        }
    }
});


/**
 * client.on('voiceStateUpdate', (old, new))
 * To connect, old state's id is either null or afk channel's
 * To disconnect, new state's id is either null or afk channel's
 */
client.on('voiceStateUpdate', (oldVoiceState, newVoiceState) => {
    // verbose(`[DBOT] Old: ${oldVoiceState.channelID}, New: ${newVoiceState.channelID}`);
    // Really melted my brain on these two ifs
    if (!newVoiceState.member.user.bot) {
        if ((oldVoiceState.channelID == null || (oldVoiceState.channelID == currentGuild.afkChannelID && newVoiceState.channelID != null))
            && newVoiceState.channelID != currentGuild.afkChannelID) {
            // Connect procedure
            console.log(`[DBOT] ${newVoiceState.member.displayName} has connected`);
            if (db.users.exists(newVoiceState.member.id)) {
                verbose(`[DBOT] ${newVoiceState.member.displayName} exists in db, adding user to toIncrement`);
                toIncrement.push(newVoiceState.member);
            } else {
                verbose(`[DBOT] ${newVoiceState.member.displayName} does not exist in db, creating new user in DB and adding to toIncrement`);
                db.users.addUser(new DB.User(newVoiceState.member.id, 'PT0S'));
                db.write();
                toIncrement.push(newVoiceState.member);
            }
            verbose(`[DBOT] Contents of toIncrement: `);
            toIncrement.forEach(member => { verbose(`[DBOT] - ${member.displayName}: ${db.users.findByID(member.id).totalTime}`) });
        }
        if ((oldVoiceState.channelID != currentGuild.afkChannelID && newVoiceState.channelID == null) || (newVoiceState.channelID == currentGuild.afkChannelID && oldVoiceState.channelID != null)) {
            // Disconnect procedure
            console.log(`[DBOT] ${newVoiceState.member.displayName} has disconnected`);
            let tempIndex = toIncrement.findIndex(elm => elm.id == newVoiceState.member.id);
            if (tempIndex != -1) {
                toIncrement.splice(tempIndex, 1);
                verbose(`[DBOT] ${newVoiceState.member.displayName} exists at index ${tempIndex} in toIncrement, removed`);
            } else {
                verbose(`[DBOT] ${newVoiceState.member.displayName} does not exist in toIncrement, ignored`);
            }
            verbose(`[DBOT] Contents of toIncrement: `);
            toIncrement.forEach(member => { verbose(`[DBOT] - ${member.displayName}: ${db.users.findByID(member.id).totalTime}`) });
        }
    }
});


/**
 * client.on('messageReactionAdd', (messageReaction)) and
 * client.on('messageReactionAdd', (messageReaction))
 * To keep track of role reacts
 */
client.on('messageReactionAdd', messageReaction => {
    verbose("Message reaction added");
    let reactMessage = db.reactMessages.find(message => message.id == messageReaction.message.id);
    if (reactMessage) {
        messageReaction.users.fetch({ limit: 100 }).then(users => {
            // Compare reacted users from messages to reacted users from DB
            // User that doesn't exist in DB needs to be given role and added to DB
            users.each(user => {
                if (!user.bot) {
                    let role = reactMessage.roles.find(f => f.emoji == messageReaction.emoji.toString());
                    if (role) {
                        if (!role.users.includes(user.id)) {
                            // Find role id in DB according to emoji string in messageReaction
                            setRole(user.id, role.role_id, () => {
                                role.users.push(user.id);
                                db.write();
                            });

                        }
                    }
                }
            });
        });
    }
});

client.on('messageReactionRemove', messageReaction => {
    verbose("Message reaction removed");
    let reactMessage = db.reactMessages.find(message => message.id == messageReaction.message.id);
    if (reactMessage) {
        let tempUsers = [];
        messageReaction.users.fetch({ limit: 100 }).then(users => {
            users.each(user => {
                // Extract user ids from fetched non-bot users
                if (!user.bot) {
                    tempUsers.push(user.id);
                }
            });
            // Other way round
            // Compare reacted users from DB to reacted user ids extracted from messages
            // User that doesn't exist in messages have their role removed and removed from DB
            let role = reactMessage.roles.find(f => f.emoji == messageReaction.emoji.toString());
            role.users.forEach(rUser => {
                // Bot check not needed here because only users are added to reactMessage.users, check main.js:529
                if (!tempUsers.includes(rUser)) {
                    // Find role id in DB according to emoji string in messageReaction
                    removeRole(rUser, role.role_id, () => {
                        let index = role.users.findIndex(elm => elm == rUser);
                        role.users.splice(index, 1);
                        db.write();
                    });
                }
            });
        });
    }
});


/**
 * client.on('messageDelete', message)
 * Currently used to delete sent reaction role messages
 */
client.on('messageDelete', message => {
    let index = db.reactMessages.findIndex(msg => msg.id == message.id);
    if (index != -1) {
        fetchReactMessages();
    }
});

/**
 * This function increments the time of users in toIncrement[]
 */
var verboseMessageLimit = 0;
setInterval(() => {
    verboseMessageLimit++;
    if (toIncrement.length > 1) {
        toIncrement.forEach(member => {
            let user = db.users.findByID(member.id);
            let tempDuration = new dayjs.duration(user.totalTime);
            tempDuration = tempDuration.add(5, 'seconds');
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
                verbose(`[DBOT] Incrementing ${toIncrement.length} users' totalTime by 60 seconds`);
                verboseMessageLimit = 0;
            }
        });
        if (db.week) {
            let tempDuration;
            switch (dayjs().day()) {
                case 0:
                    tempDuration = new dayjs.duration(db.week.sunday);
                    tempDuration = tempDuration.add(5, 'seconds');
                    db.week.sunday = tempDuration.toJSON();
                    break;
                case 1:
                    tempDuration = new dayjs.duration(db.week.monday);
                    tempDuration = tempDuration.add(5, 'seconds');
                    db.week.monday = tempDuration.toJSON();
                    break;
                case 2:
                    tempDuration = new dayjs.duration(db.week.tuesday);
                    tempDuration = tempDuration.add(5, 'seconds');
                    db.week.tuesday = tempDuration.toJSON();
                    break;
                case 3:
                    tempDuration = new dayjs.duration(db.week.wednesday);
                    tempDuration = tempDuration.add(5, 'seconds');
                    db.week.wednesday = tempDuration.toJSON();
                    break;
                case 4:
                    tempDuration = new dayjs.duration(db.week.thursday);
                    tempDuration = tempDuration.add(5, 'seconds');
                    db.week.thursday = tempDuration.toJSON();
                    break;
                case 5:
                    tempDuration = new dayjs.duration(db.week.friday);
                    tempDuration = tempDuration.add(5, 'seconds');
                    db.week.friday = tempDuration.toJSON();
                    break;
                case 6:
                    tempDuration = new dayjs.duration(db.week.saturday);
                    tempDuration = tempDuration.add(5, 'seconds');
                    db.week.saturday = tempDuration.toJSON();
                    break;
            }
        }
        db.write();
    }
}, 5000);

client.login(db.config.token).catch(err => {
    console.log('[DBOT] Unable to log in, exiting');
    verbose(err);
    process.exit(1);
});

//#endregion

/****************************************
 *                                      *
 *                                      *
 * SOCKET.IO AND CONTROL PANEL BELOW    *
 *                                      *
 *                                      *
 ****************************************/
// Functions related to web panel
// Creates and sends an embedded message using data from web control panel
function webSendEmbed(data) {
    let embed = new Discord.MessageEmbed();
    if (data.author.length > 0) { // Author required, Author Icon not
        if (data.author_avatar_url.length > 0) {
            embed.setAuthor(data.author, data.author_avatar_url);
        } else {
            embed.setAuthor(data.author);
        }
    }
    if (data.title.length > 0) embed.setTitle(data.title);
    if (data.content_text.length > 0) embed.setDescription(data.content_text);
    if (data.thumbnail_url.length > 0) embed.setThumbnail(data.thumbnail_url);
    data.fields.forEach(field => {
        if ("title" in field && "text" in field) {
            if (field.title.length > 0 && field.text.length > 0) {
                let bool;
                if (field.inline == 'true') {
                    bool = true;
                } else if (field.inline == 'false') {
                    bool = false;
                }
                console.log(field);
                embed.addField(field.title, field.text, bool);
            }
        }
    });
    if (data.main_image_url.length > 0) {
        embed.setImage(data.main_image_url);
    }
    if (data.footer_text.length > 0) {
        if (data.footer_icon_url.length > 0) {
            embed.setFooter(data.footer_text, data.footer_icon_url);
        } else {
            embed.setFooter(data.footer_text);
        }
    }
    embed.setColor(data.color_hex);
    embed.setTimestamp();
    currentGuild.channels.resolve(data.channel_id).send(embed);
}

function returnAuth(authkey) {
    // Returns authkey and user id pair if found, null if not found
    for (let i = 0; i < db.config.authkey.length; i++) {
        if (db.config.authkey[i].key == authkey) return db.config.authkey[i];
    }
    return null;
}

function createReactRoleMessage(data) {
    let roles = [];
    verbose('[DBOT] Parsing roles');

    // Parse roles
    for (let i = 0; i < data.react_roles.length; i++) {
        const element = data.react_roles[i];
        verbose(`[DBOT] - ${element.emoji}, ${element.description}, ${element.role_id}`);
        // Verify if all properties exist in element
        if ("emoji" in element && "description" in element && "role_id" in element) {
            if (element.emoji.length > 0 && element.description.length > 0 && element.role_id.length > 0) {
                // All properties exist, start trying to parse emotes
                // First check whether emoji is custom or not
                let toResolve = element.emoji.slice(1, element.emoji.length - 1);
                let customEmoji = currentGuild.emojis.cache.find(emoji => emoji.name == toResolve);
                if (customEmoji) {
                    // If emoji can be resolved to a custom emoji, create a new role and push to roles
                    roles.push({
                        emoji: customEmoji.toString(),
                        description: element.description,
                        role_id: element.role_id
                    });
                } else {
                    // If cannot be resolved as custom emoji, try to resolve as unicode emoji
                    let unicodeEmoji = nodeEmoji.get(element.emoji);
                    if (unicodeEmoji != element.emoji) {
                        roles.push({
                            emoji: unicodeEmoji,
                            description: element.description,
                            role_id: element.role_id
                        });
                    } else {
                        console.log('[DBOT] Emoji cannot be resolved, cancelling create react role message');
                        return false;
                    }
                }
            } else {
                console.log('[DBOT] Some properties are empty, cancelling create react role message');
                return false;
            }
        } else {
            console.log('[DBOT] Role react does not contain all properties, cancelling create react role message');
            verbose(`[DBOT] - emoji: ${"emoji" in element}, description: ${"description" in element}, role_id: ${"role_id" in element}`);
            return false;
        }
    }

    // Start embedded message creation
    let embed = new Discord.MessageEmbed();
    embed.setFooter(botDisplayName, client.user.displayAvatarURL({
        dyanamic: true,
        size: 64
    }));
    embed.setTimestamp();
    embed.setColor(defaultEmbedColor);
    if (data.title.length > 0) {
        embed.setTitle(data.title);
    }
    let desc = ''; // Variable for description of embedded message
    if (data.content_text.length > 0) {
        desc += data.content_text + '\n\n';
    }

    roles.forEach(role => {
        desc += ` ${role.emoji} - ** ${role.description} ** \n`;
    });
    embed.setDescription(desc);
    let messageID;
    currentGuild.channels.resolve(data.channel_id).send(embed)
        .then(message => {
            // Get message and react roles to it
            roles.forEach(role => {
                message.react(role.emoji).catch(() => {
                    console.log(`[DBOT] Failed to react: ${role.emoji}`);
                });
            });
            messageID = message.id;
        }).finally(() => {
            //Add message id to db for later tracking
            let tempMessage = new DB.ReactMessage();
            tempMessage.id = messageID;
            tempMessage.channel = data.channel_id;
            roles.forEach(role => {
                let tempRole = new DB.ReactRole(role.emoji, role.role_id);
                tempMessage.roles.push(tempRole);
            });
            db.reactMessages.push(tempMessage);
            db.write();
        });
}

if (ENABLE_CONTROL_PANEL) {
    client.on('ready', () => {
        const PORT = 3000;
        const express = require('express');
        const app = express();
        const http = require('http').Server(app);
        const io = require('socket.io')(http);

        app.use(express.static('control_panel'));

        io.on('connection', (socket) => {
            let currentAuthPair = returnAuth(socket.handshake.auth.token);
            if (currentAuthPair == null) {
                socket.disconnect(true);
                verbose('[DBOTCTRL] Invalid credentials, connection has been terminated');
                return;
            }

            verbose('[DBOTCTRL] Control panel has connected');
            socket.on('get', type => {
                if (type == 'connection-info') {
                    if (currentGuild) {
                        currentGuild.members.fetch(currentAuthPair.user_id).then(member => {
                            let tempJSON = {
                                server: currentGuild.name,
                                server_avatar: currentGuild.iconURL({
                                    dyanamic: true,
                                    size: 64
                                }),
                                bot: botDisplayName,
                                bot_avatar: client.user.displayAvatarURL({
                                    dyanamic: true,
                                    size: 64
                                }),
                                user: member.displayName,
                                user_avatar: member.user.displayAvatarURL({
                                    dyanamic: true,
                                    size: 64
                                }),
                                server_version: version
                            }
                            socket.emit('reply', 'connection-info', JSON.stringify(tempJSON));
                        });
                    }
                }
                if (type == 'guild-text-channels') {
                    if (currentGuild) {
                        let arr = [];
                        currentGuild.channels.cache.each(channel => {
                            if (channel.type == 'text') {
                                let temp = {
                                    name: channel.name,
                                    id: channel.id
                                };
                                arr.push(temp);
                            }
                        });
                        let jayson = JSON.stringify(arr);
                        socket.emit('reply', 'guild-text-channels', jayson);
                    }
                }

                if (type == 'voice-hours') {
                    sendCurrentVoiceMembers();
                }

                if (type == 'weekly-voice-hours') {
                    if (db.week) {
                        console.log('[DBOT] Fetching weekly voice hours and sending to control panel');
                        let tempHours = [
                            parseFloat(dayjs.duration(db.week.sunday).asHours().toFixed(2)),
                            parseFloat(dayjs.duration(db.week.monday).asHours().toFixed(2)),
                            parseFloat(dayjs.duration(db.week.tuesday).asHours().toFixed(2)),
                            parseFloat(dayjs.duration(db.week.wednesday).asHours().toFixed(2)),
                            parseFloat(dayjs.duration(db.week.thursday).asHours().toFixed(2)),
                            parseFloat(dayjs.duration(db.week.friday).asHours().toFixed(2)),
                            parseFloat(dayjs.duration(db.week.saturday).asHours().toFixed(2))
                        ];
                        socket.emit('reply', 'weekly-voice-hours', JSON.stringify(tempHours));
                    }
                }

                if (type == 'guild-roles-filtered') {
                    if (currentGuild) {
                        console.log('[DBOT] Fetching filtered roles and sending to control panel');
                        let tempRoles = [];
                        currentGuild.roles.fetch().then(roles => {
                            roles.cache.each(role => {
                                // Filter rules
                                // Exclude bot roles, role.managed
                                // Exclude administrator roles, role.permissions.serialize().ADMINISTRATOR == true
                                // Exclude strings with invisible character 7356 used as spacers, role.name.charCodeAt(0) != 7356
                                if (!role.managed &&
                                    !role.permissions.serialize().ADMINISTRATOR &&
                                    role.name.charCodeAt(0) != 7356 &&
                                    role.name != '@everyone') {
                                    let tempRole = {
                                        name: role.name,
                                        id: role.id
                                    }
                                    tempRoles.push(tempRole);
                                }
                            });

                            // Code from w3schools
                            // https://www.w3schools.com/js/js_array_sort.asp
                            tempRoles.sort((a, b) => {
                                var x = a.name.toLowerCase();
                                var y = b.name.toLowerCase();
                                if (x < y) { return -1; }
                                if (x > y) { return 1; }
                                return 0;
                            }
                            );
                            socket.emit('reply', 'guild-roles-filtered', JSON.stringify(tempRoles));
                        });
                    }
                }
            });

            socket.on('send', (type, data) => {
                if (type == 'embed') {
                    let temp = JSON.parse(data);
                    webSendEmbed(temp);
                }

                if (type == 'react-role-message') {
                    let temp = JSON.parse(data);
                    createReactRoleMessage(temp);
                }
            });

            // Send info to control panel: uptime, currentGuild.name, currentGuild avatarURL, botDisplayName, 
            // client.user.avatarURL({format: 'gif', dynamic: true, size: 32})
            function sendCurrentVoiceMembers() {
                if (currentGuild && db.users) {
                    console.log('[DBOT] Fetching voice hours and sending to control panel');
                    var tempIDs = [];
                    var tempUsers = [];

                    db.users.getArray().forEach(user => {
                        tempIDs.push(user.id);
                    });
                    currentGuild.members.fetch({ user: tempIDs })
                        .then(members => {
                            members.each(member => {
                                let tempDuration = dayjs.duration(0).add(db.users.findByID(member.id).totalTime);
                                let totalHours = (tempDuration.days() * 24) + tempDuration.hours();
                                let timeString = '';
                                if (totalHours > 0) {
                                    timeString = timeString.concat(`${totalHours} hours `);
                                }
                                timeString = timeString.concat(`${tempDuration.format('mm[ minutes and ]ss[ seconds]')}`);
                                let user = {
                                    displayName: member.displayName,
                                    avatarURL: `https://cdn.discordapp.com/avatars/${member.id}/${member.user.avatar}.png?size=256`,
                                    timeraw: `${tempDuration.toJSON()}`,
                                    time: timeString
                                }
                                tempUsers.push(user);
                            });
                            tempUsers = tempUsers.sort((a, b) => {
                                let aSort = dayjs.duration(a.timeraw).asSeconds();
                                let bSort = dayjs.duration(b.timeraw).asSeconds();
                                return bSort - aSort;
                            });
                            socket.emit('reply', 'voice-hours', JSON.stringify(tempUsers));
                        }).catch(console.error);
                }
            }
        });

        http.listen(PORT, () => {
            console.log(`[DBOTCTRL] Socket.IO listening on port ${PORT}`);
        });
    });
}