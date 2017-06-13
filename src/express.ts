/**
 * @file Homekit Accessory Server Core Application
 * @author MohammadHossein Abedinpour <abedinpourmh@gmail.com>
 * @licence Apache2
 */

import * as express from 'express';
import * as bodyParser from 'body-parser';
import {HAS} from './HAS';
import {Pairing, Pairings} from './configurationHelper';
import * as TLVEnums from './TLV/values';
import parseTLV from './TLV/parse';
import {encodeTLV, encodeTLVError} from './TLV/encode';
import SRP from './encryption/SRP';
import HKDF from './encryption/HKDF';
import * as ChaCha from './encryption/ChaCha20Poly1305AEAD';
const Ed25519 = require('ed25519');
const Curve25519 = require('curve25519-n2');

export default function (server: HAS): express.Express {
    const app: express.Express = express();

    //Decode TLV request body if exists / Set real TCP socket
    app.use((req: any, res, next) => {
        if (!req.headers['x-real-socket-id']) {
            res.end();
            return;
        }
        req.realSocket = server.TCPServer.connections[req.headers['x-real-socket-id']];
        if (!req.realSocket) {
            res.end();
            return;
        }
        res.removeHeader('x-powered-by');
        res.header('X-Real-Socket-ID', req.realSocket.ID);
        if (req.headers['content-type'] && req.headers['content-type'].indexOf('tlv') > -1) {
            let data = Buffer.alloc(0);
            req.on('data', function (chunk: Buffer) {
                data = Buffer.concat([data, chunk]);
            });
            req.on('end', function () {
                req.body = req.body || {};
                req.body.TLV = parseTLV(data);
                next();
            });
        } else
            next();
    });
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({extended: false}));

    app.post('/pair-setup', (req: any, res) => {
        //console.log(req.body, req.realSocket.ID);
        res.header('Content-Type', 'application/pairing+tlv8');

        let currentState = (req.body.TLV[TLVEnums.TLVValues.state]) ? parseInt(req.body.TLV[TLVEnums.TLVValues.state].toString('hex')) : 0x00;

        //Sent parameters can be wrong, So we have to be ready for errors
        try {
            //Server is already paired
            if (server.config.statusFlag != 0x01) {
                res.end(encodeTLVError(TLVEnums.TLVErrors.unavailable, currentState));
                return;
            }

            //Too much failed tries / Server should be restarted
            if (server.config.failedAuthCounter > 100) {
                res.end(encodeTLVError(TLVEnums.TLVErrors.maxTries, currentState));
                return;
            }

            //M1 <iOS> -> M2 <Server>
            if (currentState === 0x01) {
                //Another pairing is already in process
                if (server.config.lastPairStepTime && new Date().getTime() - server.config.lastPairStepTime.getTime() < 30000 && server.config.SRP && server.config.SRP.socketID !== req.realSocket.ID) {
                    res.end(encodeTLVError(TLVEnums.TLVErrors.busy, currentState));
                    return;
                }
                server.config.lastPairStepTime = new Date();

                server.config.SRP = new SRP(server.config.setupCode);
                server.config.SRP.socketID = req.realSocket.ID;
                res.end(encodeTLV([
                    {
                        key: TLVEnums.TLVValues.state,
                        value: currentState + 1
                    }, {
                        key: TLVEnums.TLVValues.publicKey,
                        value: server.config.SRP.getPublicKey()
                    }, {
                        key: TLVEnums.TLVValues.salt,
                        value: server.config.SRP.salt
                    }]));
                return;
            }

            server.config.lastPairStepTime = new Date();

            //M1&M2 is passed but we don't have an SRP object yet!
            if (!server.config.SRP) {
                res.end(encodeTLVError(TLVEnums.TLVErrors.unknown, currentState));
                return;
            }

            //M3 <iOS> -> M4 <Server>
            if (currentState === 0x03) {
                server.config.SRP.setClientPublicKey(req.body.TLV[TLVEnums.TLVValues.publicKey]);
                if (server.config.SRP.checkClientProof(req.body.TLV[TLVEnums.TLVValues.proof])) {
                    res.end(encodeTLV([
                        {
                            key: TLVEnums.TLVValues.state,
                            value: currentState + 1
                        }, {
                            key: TLVEnums.TLVValues.proof,
                            value: server.config.SRP.getM2Proof()
                        }]));
                    return;
                } else {
                    server.config.lastPairStepTime = undefined;
                    res.end(encodeTLVError(TLVEnums.TLVErrors.authentication, currentState));
                }
                return;
            }

            //M5 <iOS> -> M6 <Server>
            if (currentState === 0x05) {
                let body = req.body.TLV[TLVEnums.TLVValues.encryptedData],
                    encryptedData = body.slice(0, body.length - 16),
                    tag = body.slice(body.length - 16),
                    key = HKDF(server.config.SRP.getSessionKey());

                let data = ChaCha.decrypt(key, 'PS-Msg05', tag, encryptedData);
                if (data === false)
                    res.end(encodeTLVError(TLVEnums.TLVErrors.authentication, currentState));
                else {
                    let info = parseTLV(data as Buffer);

                    let iOSDeviceInfo = Buffer.concat([HKDF(server.config.SRP.getSessionKey(), 'Pair-Setup-Controller-Sign-Salt', 'Pair-Setup-Controller-Sign-Info'), info[TLVEnums.TLVValues.identifier], info[TLVEnums.TLVValues.publicKey]]);

                    if (Ed25519.Verify(iOSDeviceInfo, info[TLVEnums.TLVValues.signature], info[TLVEnums.TLVValues.publicKey])) {
                        server.config.addPairing(info[TLVEnums.TLVValues.identifier], info[TLVEnums.TLVValues.publicKey], true);

                        let accessoryInfo = Buffer.concat([HKDF(server.config.SRP.getSessionKey(), 'Pair-Setup-Accessory-Sign-Salt', 'Pair-Setup-Accessory-Sign-Info'), Buffer.from(server.config.deviceID), server.config.publicKey]);
                        let accessorySignature = Ed25519.Sign(accessoryInfo, server.config.privateKey);

                        let plainTLV = encodeTLV([
                            {
                                key: TLVEnums.TLVValues.identifier,
                                value: server.config.deviceID
                            },
                            {
                                key: TLVEnums.TLVValues.publicKey,
                                value: server.config.publicKey
                            },
                            {
                                key: TLVEnums.TLVValues.signature,
                                value: accessorySignature
                            }
                        ]);

                        res.end(encodeTLV([
                            {
                                key: TLVEnums.TLVValues.state,
                                value: currentState + 1
                            }, {
                                key: TLVEnums.TLVValues.encryptedData,
                                value: ChaCha.encrypt(key, 'PS-Msg06', plainTLV)
                            }]));
                    } else
                        res.end(encodeTLVError(TLVEnums.TLVErrors.authentication, currentState));
                }
                return;
            }
        } catch (e) {
            console.error(e);
            server.config.lastPairStepTime = undefined;
            res.end(encodeTLVError(TLVEnums.TLVErrors.unknown, currentState));
        }
    });

    app.post('/pair-verify', (req: any, res) => {
        //console.log(req.body, req.realSocket.ID);
        res.header('Content-Type', 'application/pairing+tlv8');

        let currentState = (req.body.TLV[TLVEnums.TLVValues.state]) ? parseInt(req.body.TLV[TLVEnums.TLVValues.state].toString('hex')) : 0x00;

        //Sent parameters can be wrong, So we have to be ready for errors
        try {
            //M1 <iOS> -> M2 <Server>
            if (currentState === 0x01) {
                let secretKey = Buffer.alloc(32);
                secretKey = Curve25519.makeSecretKey(secretKey);

                let publicKey = Curve25519.derivePublicKey(secretKey),
                    sharedKey = Curve25519.deriveSharedSecret(secretKey, req.body.TLV[TLVEnums.TLVValues.publicKey]);

                let accessoryInfo = Buffer.concat([publicKey, Buffer.from(server.config.deviceID), req.body.TLV[TLVEnums.TLVValues.publicKey]]);

                let accessorySignature = Ed25519.Sign(accessoryInfo, server.config.privateKey);

                let plainTLV = encodeTLV([
                    {
                        key: TLVEnums.TLVValues.identifier,
                        value: server.config.deviceID
                    },
                    {
                        key: TLVEnums.TLVValues.signature,
                        value: accessorySignature
                    }
                ]);

                let sessionKey = HKDF(sharedKey, 'Pair-Verify-Encrypt-Salt', 'Pair-Verify-Encrypt-Info');

                req.realSocket.HAPEncryption = {
                    serverSecretKey: secretKey,
                    serverPublicKey: publicKey,
                    sharedKey: sharedKey,
                    clientPublicKey: req.body.TLV[TLVEnums.TLVValues.publicKey],
                    sessionKey: sessionKey
                };

                res.end(encodeTLV([
                    {
                        key: TLVEnums.TLVValues.state,
                        value: currentState + 1
                    }, {
                        key: TLVEnums.TLVValues.encryptedData,
                        value: ChaCha.encrypt(sessionKey, 'PV-Msg02', plainTLV)
                    }, {
                        key: TLVEnums.TLVValues.publicKey,
                        value: publicKey
                    }]));
                return;
            }

            //M1&M2 is passed but we don't have an HAPEncryption object yet!
            if (!req.realSocket.HAPEncryption) {
                res.end(encodeTLVError(TLVEnums.TLVErrors.unknown, currentState));
                return;
            }

            //M3 <iOS> -> M4 <Server>
            if (currentState === 0x03) {
                let body = req.body.TLV[TLVEnums.TLVValues.encryptedData],
                    encryptedData = body.slice(0, body.length - 16),
                    tag = body.slice(body.length - 16);

                let data = ChaCha.decrypt(req.realSocket.HAPEncryption.sessionKey, 'PV-Msg03', tag, encryptedData);
                if (data === false)
                    res.end(encodeTLVError(TLVEnums.TLVErrors.authentication, currentState));
                else {
                    let info = parseTLV(data as Buffer);

                    let pairing = server.config.getPairings(info[TLVEnums.TLVValues.identifier]);
                    if (pairing === false)
                        res.end(encodeTLVError(TLVEnums.TLVErrors.authentication, currentState));
                    else {
                        pairing = pairing as Pairing;
                        let iOSDeviceInfo = Buffer.concat([req.realSocket.HAPEncryption.clientPublicKey, info[TLVEnums.TLVValues.identifier], req.realSocket.HAPEncryption.serverPublicKey]);
                        if (Ed25519.Verify(iOSDeviceInfo, info[TLVEnums.TLVValues.signature], Buffer.from(pairing.publicKey, 'hex'))) {
                            req.realSocket.HAPEncryption.accessoryToControllerKey = HKDF(req.realSocket.HAPEncryption.sharedKey, 'Control-Salt', 'Control-Read-Encryption-Key');
                            req.realSocket.HAPEncryption.controllerToAccessoryKey = HKDF(req.realSocket.HAPEncryption.sharedKey, 'Control-Salt', 'Control-Write-Encryption-Key');
                            req.realSocket.isEncrypted = true;

                            req.realSocket.keepAliveForEver();

                            res.end(encodeTLV([
                                {
                                    key: TLVEnums.TLVValues.state,
                                    value: currentState + 1
                                }]));
                        } else
                            res.end(encodeTLVError(TLVEnums.TLVErrors.authentication, currentState));
                    }
                }
                return;
            }
        } catch (e) {
            console.error(e);
            res.end(encodeTLVError(TLVEnums.TLVErrors.unknown, currentState));
        }
    });


    return app;
};