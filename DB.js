const fs = require('fs');

class Config {
    constructor(external) {
        if (external) {
            this.guildID = external.guildID;
            this.prefix = external.prefix;
            this.token = external.token;
            this.announcementID = external.announcementID;
            this.ranks = external.ranks;
            this.authkey = external.authkey;
        } else {
            this.guildID = '-1';
            this.prefix = '^';
            this.token = null;
            this.announcementID = '-1';
            this.ranks = [];
            this.authkey = [];
        }
    }
    guildID; prefix; token; announcementID; ranks; authkey;
}

class User {
    constructor(id, totalTime) {
        this.id = id;
        this.totalTime = totalTime;
    }
    id; totalTime;
}

class Users {
    #array;

    constructor(external) {
        this.#array = [];
        if (external) {
            // For vscode to realize types
            external.forEach(element => {
                let tempUser = new User(element.id, element.totalTime);
                this.addUser(tempUser);
            });
        }
    }

    findByID(id) {
        return this.#array.find(elm => elm.id == id);
    }

    findIndexByID(id) {
        return this.#array.findIndex(elm => elm.id == id);
    }

    addUser(user) {
        this.#array.push(user);
    }

    exists(id) {
        if (this.findIndexByID(id) == -1) {
            return false;
        } else {
            return true;
        }
    }

    getArray() {
        return this.#array;
    }

    clearUsers() {
        this.#array = [];
    }
}

class Week {
    monday; tuesday; wednesday; thursday; friday; saturday; sunday;
    constructor(external) {
        if (external) {
            this.monday = external.monday;
            this.tuesday = external.tuesday;
            this.wednesday = external.wednesday;
            this.thursday = external.thursday;
            this.friday = external.friday;
            this.saturday = external.saturday;
            this.sunday = external.sunday;
        } else {
            this.monday = 'PT0D';
            this.tuesday = 'PT0D';
            this.wednesday = 'PT0D';
            this.thursday = 'PT0D';
            this.friday = 'PT0D';
            this.saturday = 'PT0D';
            this.sunday = 'PT0D';
        }
    }
}

class External {
    constructor(users, reactMessages, week, config) {
        this.users = users.getArray();
        this.reactMessages = reactMessages;
        this.week = week;
        this.config = config;
    }
    users; reactMessages; week; config;
}

class ReactMessage {
    id; roles; channel;
    constructor(id, channel, roles) {
        this.id = '-1';
        this.channel = '-1';
        this.roles = [];
        if (id) {
            this.id = id;
        }
        if (channel) {
            this.channel = channel;
        }
        if (roles) {
            roles.forEach(role => {
                let r = new ReactRole(role.emoji, role.role_id);
                role.users.forEach(user => {
                    r.users.push(user);
                });
                this.roles.push(r);
            });
        }
    }
}

class ReactRole {
    emoji; role_id; users;
    constructor(emoji, role_id, users) {
        this.emoji = '';
        this.role_id = -1;
        this.users = [];
        if (emoji) {
            this.emoji = emoji;
        }
        if (role_id) {
            this.role_id = role_id;
        }
        if (users) {
            users.forEach(user => {
                this.users.push(user);
            });
        }
    }
}

class DB {
    #path; users; reactMessages; week; config;
    constructor(path) {
        this.#path = path;

        // Declare all DB properties here
        this.users = new Users();
        this.week = new Week();
        this.config = new Config();
        this.reactMessages = [];

        // Creates new file if doesn't exist
        if (!fs.existsSync(path)) {
            fs.writeFileSync(path, '');
            // To write to newly created files
            this.write();
        }

        let temp;
        // Read from external json object
        temp = JSON.parse(fs.readFileSync(path));
        // Copy data from external object
        this.users = new Users(temp.users);
        this.week = new Week(temp.week);
        this.config = new Config(temp.config);
        if (temp.reactMessages) {
            // Doing this instead of temp.reactMsgIDs = this.reactMsgIDs 
            // preserves data type to work better with intellisense
            temp.reactMessages.forEach(reactMessage => {
                let temp = new ReactMessage(reactMessage.id, reactMessage.channel, reactMessage.roles);
                this.reactMessages.push(temp);
            });
        }

        // To update properties of existing JSON files
        this.write();
    }

    write() {
        let temp = new External(this.users, this.reactMessages, this.week, this.config);
        try {
            fs.writeFileSync(this.#path, JSON.stringify(temp));
        } catch (error) {
            console.log(error);
        }
    }
}

module.exports = DB;
module.exports.User = User;
module.exports.Users = Users;
module.exports.Config = Config;
module.exports.Week = Week;
module.exports.ReactMessage = ReactMessage;
module.exports.ReactRole = ReactRole;
// External is not exported as it is designed for use within DB.js