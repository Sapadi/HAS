"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var FS = require("fs");
var crypto = require("crypto");
var Ed25519 = require('ed25519');
var HASConfig = (function () {
    function HASConfig(deviceName, deviceID, category, configDir, TCPPort, setupCode) {
        this.CCN = 1;
        this.featureFlag = 0x00;
        this.protocolVersion = '1.0';
        this.CSN = 1;
        this.statusFlag = 0x01;
        this.failedAuthCounter = 0;
        this.pairings = {};
        if (deviceName)
            this.deviceName = deviceName;
        else
            throw new Error('Invalid Device Name');
        if (deviceID && deviceID.match(/^([0-9A-Fa-f]{2}[:]){5}([0-9A-Fa-f]{2})$/))
            this.deviceID = deviceID;
        else
            throw new Error('Invalid Device ID');
        if (category && !isNaN(category) && category > 0 && category < 20)
            this.category = category;
        else
            throw new Error('Invalid Category Identifier');
        if (TCPPort && !isNaN(TCPPort) && TCPPort > 0)
            this.TCPPort = TCPPort;
        else
            throw new Error('Invalid HTTP Port');
        if (setupCode && setupCode.match(/^[0-9]{3}-[0-9]{2}-[0-9]{3}$/))
            this.setupCode = setupCode;
        else
            throw new Error('Invalid Setup Code');
        if (configDir) {
            this.configDir = configDir;
            if (FS.existsSync(configDir)) {
                this.readConfig();
            }
            else {
                this.writeConfig();
            }
        }
        else
            throw new Error('Invalid Config File');
    }
    HASConfig.prototype.readConfig = function () {
        var config = JSON.parse(FS.readFileSync(this.configDir, 'utf8'));
        if (config) {
            this.CCN = config.CCN;
            this.pairings = config.pairings || {};
            if (Object.keys(this.pairings).length > 0)
                this.statusFlag = 0x00;
            if (config.publicKey)
                this.publicKey = Buffer.from(config.publicKey, 'hex');
            if (config.privateKey)
                this.privateKey = Buffer.from(config.privateKey, 'hex');
        }
        else
            throw new Error('Invalid Config File');
    };
    HASConfig.prototype.writeConfig = function () {
        if (!this.publicKey || !this.privateKey) {
            var seed = crypto.randomBytes(32);
            var keyPair = Ed25519.MakeKeypair(seed);
            this.publicKey = keyPair.publicKey;
            this.privateKey = keyPair.privateKey;
        }
        FS.writeFileSync(this.configDir, JSON.stringify({
            CCN: this.CCN,
            pairings: this.pairings,
            publicKey: this.publicKey.toString('hex'),
            privateKey: this.privateKey.toString('hex')
        }), 'utf8');
    };
    HASConfig.prototype.increaseCCN = function () {
        this.CCN++;
        this.writeConfig();
    };
    HASConfig.prototype.getTXTRecords = function () {
        return {
            'c#': this.CCN,
            ff: this.featureFlag,
            id: this.deviceID,
            md: this.deviceName,
            pv: this.protocolVersion,
            's#': this.CSN,
            sf: this.statusFlag,
            ci: this.category
        };
    };
    HASConfig.prototype.addPairing = function (ID, publicKey, isAdmin) {
        var IDString = ID.toString('utf8');
        if (this.pairings[IDString]) {
            throw new Error('ID already exists.');
        }
        this.pairings[IDString] = {
            publicKey: publicKey.toString('hex'),
            isAdmin: isAdmin
        };
        if (isAdmin)
            this.statusFlag = 0x00;
        this.writeConfig();
    };
    HASConfig.prototype.removePairing = function (ID) {
        var IDString = ID.toString('utf8');
        if (!this.pairings[IDString]) {
            throw new Error('ID does NOT exists.');
        }
        delete this.pairings[IDString];
        this.writeConfig();
    };
    HASConfig.prototype.getPairings = function (ID) {
        if (ID) {
            var IDString = ID.toString('utf8');
            if (!this.pairings[IDString])
                return false;
            return this.pairings[IDString];
        }
        else
            return this.pairings;
    };
    return HASConfig;
}());
exports.HASConfig = HASConfig;
