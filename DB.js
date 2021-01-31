const fs = require('fs');

class Config {
    guildID; prefix; token; announcementID;
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
    constructor(path) {
        this.#path = path;
        if (!fs.existsSync(path)) {
            fs.writeFileSync(path, JSON.stringify({
                users: [],
                config: {
                    guildID: '-1',
                    announcementID: '-1',
                    prefix: '^',
                    token: null
                }
            }));
        }
        this.#object = JSON.parse(fs.readFileSync(path));
        this.users = new Users();
        this.#object.users.forEach(element => {
            let tempUser = new User(element.id, element.totalTime);
            this.users.addUser(tempUser);
        });;
        this.config = new Config;
        this.config.guildID = this.#object.config.guildID;
        this.config.prefix = this.#object.config.prefix;
        this.config.token = this.#object.config.token;
        this.config.announcementID = this.#object.config.announcementID;
    }

    write() {
        this.#object.users = this.users.getArray();
        this.#object.config.guildID = this.config.guildID;
        this.#object.config.prefix = this.config.prefix;
        this.#object.config.announcementID = this.config.announcementID;
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