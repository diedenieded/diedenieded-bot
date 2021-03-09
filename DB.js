const fs = require('fs');

class Config {
    constructor() {
        this.guildID = '';
        this.prefix = '';
        this.token = '';
        this.announcementID = '';
        this.ranks = [];
        this.authkey = [];
    }
    guildID; prefix; token; announcementID; ranks; authkey;
}

class Users {
    #array;

    constructor() {
        this.#array = [];
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
    constructor() {
        this.monday = '';
        this.tuesday = '';
        this.wednesday = '';
        this.thursday = '';
        this.friday = '';
        this.saturday = '';
        this.sunday = '';
    }
}

class User {
    constructor(id, totalTime) {
        this.id = id;
        this.totalTime = totalTime;
    }
    id; totalTime;
}

class DB {
    #object; #path;
    users;
    config;
    week;
    constructor(path) {
        this.#path = path;
        if (!fs.existsSync(path)) {
            fs.writeFileSync(path, JSON.stringify({
                users: [],
                week: {
                    monday: 'PT0D',
                    tuesday: 'PT0D',
                    wednesday: 'PT0D',
                    thursday: 'PT0D',
                    friday: 'PT0D',
                    saturday: 'PT0D',
                    sunday: 'PT0D'
                },
                config: {
                    guildID: '-1',
                    announcementID: '-1',
                    prefix: '^',
                    token: null,
                    ranks: [],
                    authkey: []
                }
            }));
        }

        // Read from external json #object
        this.#object = JSON.parse(fs.readFileSync(path));
        this.users = new Users();

        // Can't remember why I'm doing this
        this.#object.users.forEach(element => {
            let tempUser = new User(element.id, element.totalTime);
            this.users.addUser(tempUser);
        });

        this.week = new Week();
        this.week.monday = this.#object.week.monday;
        this.week.tuesday = this.#object.week.tuesday;
        this.week.wednesday = this.#object.week.wednesday;
        this.week.thursday = this.#object.week.thursday;
        this.week.friday = this.#object.week.friday;
        this.week.saturday = this.#object.week.saturday;
        this.week.sunday = this.#object.week.sunday;

        this.config = new Config();
        this.config.guildID = this.#object.config.guildID;
        this.config.prefix = this.#object.config.prefix;
        this.config.token = this.#object.config.token;
        this.config.announcementID = this.#object.config.announcementID;
        this.config.ranks = this.#object.config.ranks;
        this.config.authkey = this.#object.config.authkey;
    }

    write() {
        this.#object.users = this.users.getArray();
        
        this.#object.config.guildID = this.config.guildID;
        this.#object.config.prefix = this.config.prefix;
        this.#object.config.announcementID = this.config.announcementID;
        this.#object.config.ranks = this.config.ranks;
        // AUTHKEY IS READ ONLY

        this.#object.week.monday = this.week.monday;
        this.#object.week.tuesday = this.week.tuesday;
        this.#object.week.wednesday = this.week.wednesday;
        this.#object.week.thursday = this.week.thursday;
        this.#object.week.friday = this.week.friday;
        this.#object.week.saturday = this.week.saturday;
        this.#object.week.sunday = this.week.sunday;
        try {
            fs.writeFileSync(this.#path, JSON.stringify(this.#object));
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