"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var TLVMethods;
(function (TLVMethods) {
    TLVMethods[TLVMethods["pairSetup"] = 1] = "pairSetup";
    TLVMethods[TLVMethods["pairVerify"] = 2] = "pairVerify";
    TLVMethods[TLVMethods["addPairing"] = 3] = "addPairing";
    TLVMethods[TLVMethods["removePairing"] = 4] = "removePairing";
    TLVMethods[TLVMethods["listPairings"] = 5] = "listPairings";
})(TLVMethods = exports.TLVMethods || (exports.TLVMethods = {}));
var TLVErrors;
(function (TLVErrors) {
    TLVErrors[TLVErrors["unknown"] = 1] = "unknown";
    TLVErrors[TLVErrors["authentication"] = 2] = "authentication";
    TLVErrors[TLVErrors["backOff"] = 3] = "backOff";
    TLVErrors[TLVErrors["maxPeers"] = 4] = "maxPeers";
    TLVErrors[TLVErrors["maxTries"] = 5] = "maxTries";
    TLVErrors[TLVErrors["unavailable"] = 6] = "unavailable";
    TLVErrors[TLVErrors["busy"] = 7] = "busy";
})(TLVErrors = exports.TLVErrors || (exports.TLVErrors = {}));
var TLVValues;
(function (TLVValues) {
    TLVValues[TLVValues["method"] = 0] = "method";
    TLVValues[TLVValues["identifier"] = 1] = "identifier";
    TLVValues[TLVValues["salt"] = 2] = "salt";
    TLVValues[TLVValues["publicKey"] = 3] = "publicKey";
    TLVValues[TLVValues["proof"] = 4] = "proof";
    TLVValues[TLVValues["encryptedData"] = 5] = "encryptedData";
    TLVValues[TLVValues["state"] = 6] = "state";
    TLVValues[TLVValues["error"] = 7] = "error";
    TLVValues[TLVValues["retryDelay"] = 8] = "retryDelay";
    TLVValues[TLVValues["certificate"] = 9] = "certificate";
    TLVValues[TLVValues["signature"] = 10] = "signature";
    TLVValues[TLVValues["permissions"] = 11] = "permissions";
    TLVValues[TLVValues["fragmentData"] = 12] = "fragmentData";
    TLVValues[TLVValues["fragmentLast"] = 13] = "fragmentLast";
    TLVValues[TLVValues["separator"] = 255] = "separator";
})(TLVValues = exports.TLVValues || (exports.TLVValues = {}));