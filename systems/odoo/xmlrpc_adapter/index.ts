import url from "url";
import xmlrpc from "xmlrpc";
import { use_api } from "../../../../use_api/index.js";

type OdooXmlrpcAdapterProps = {
    url: string;
    port?: number;
    db: string;
    username: string;
    password: string;
    secure?: boolean;
};

export type OdooMethod =
    | "search"
    | "read"
    | "search_read"
    | "create"
    | "write"
    | "unlink"
    | "fields_get"
    | "name_get"
    | "name_search"
    | "default_get";
export const create_odoo_xmlrpc_client = function (config: OdooXmlrpcAdapterProps) {
    config = config || {};

    const urlParts = url.parse(config.url);
    const host = urlParts.hostname as string;
    const port = (config.port || urlParts.port) as number;
    const db = config.db;
    const username = config.username;
    const password = config.password;
    const secure = config.secure === undefined ? urlParts.protocol == "https:" : config.secure;

    const connection_parameters = {
        urlParts,
        host,
        port,
        db,
        username,
        password,
        secure,
    };

    let common_client: xmlrpc.Client;
    const commonClientOptions = {
        host: host,
        port: port,
        path: "/xmlrpc/2/common",
    };
    if (secure == false) {
        common_client = xmlrpc.createClient(commonClientOptions);
    } else {
        common_client = xmlrpc.createSecureClient(commonClientOptions);
    }

    let object_client: xmlrpc.Client;
    const objectClientOptions = {
        host: host,
        port: port,
        path: "/xmlrpc/2/object",
    };
    if (secure == false) {
        object_client = xmlrpc.createClient(objectClientOptions);
    } else {
        object_client = xmlrpc.createSecureClient(objectClientOptions);
    }

    const connect = async function (): Promise<number> {
        return new Promise((resolve, reject) => {
            const params = [] as any[];
            params.push(db);
            params.push(username);
            params.push(password);
            params.push({});
            common_client.methodCall("authenticate", params, function (error, value) {
                if (error) {
                    return reject(error);
                }
                if (!value) {
                    return reject({ message: "No UID returned from authentication." });
                }
                return resolve(value);
            });
        });
    };

    const api_wrapper = use_api({
        login: connect,
    });
    const version = function (): Promise<any> {
        return new Promise((resolve, reject) => {
            common_client.methodCall("version", [], (error, value) => {
                if (error) {
                    return reject(error);
                } else {
                    return resolve(value);
                }
            });
        });
    };
    const execute_kw = function ({
        model,
        method,
        params = [],
    }: {
        model?: any;
        method: OdooMethod;
        params?: string | any[];
    }): Promise<any> {
        return api_wrapper.use(async (uid) => {
            return new Promise((resolve, reject) => {
                const fParams = [] as any[];
                fParams.push(db);
                fParams.push(uid);
                fParams.push(password);
                if (model) {
                    fParams.push(model);
                }
                fParams.push(method);
                for (let i = 0; i < params.length; i++) {
                    fParams.push(params[i]);
                }
                object_client.methodCall("execute_kw", fParams, function (error: any, value: any) {
                    if (error) {
                        return reject(error);
                    }
                    return resolve(value);
                });
            });
        });
    };
    const exec_workflow = function (model: any, method: any, params: string | any[]): Promise<any> {
        return api_wrapper.use(async (uid) => {
            return new Promise((resolve, reject) => {
                const fParams = [] as any[];
                fParams.push(db);
                fParams.push(uid);
                fParams.push(password);
                fParams.push(model);
                fParams.push(method);
                for (let i = 0; i < params.length; i++) {
                    fParams.push(params[i]);
                }
                object_client.methodCall("exec_workflow", fParams, function (error: any, value: any) {
                    if (error) {
                        return reject(error);
                    }
                    return resolve(value);
                });
            });
        });
    };
    const render_report = function (report: any, params: string | any[]): Promise<any> {
        return api_wrapper.use(async (uid) => {
            return new Promise((resolve, reject) => {
                const fParams = [] as any[];
                fParams.push(db);
                fParams.push(uid);
                fParams.push(password);
                fParams.push(report);
                for (let i = 0; i < params.length; i++) {
                    fParams.push(params[i]);
                }
                object_client.methodCall("render_report", fParams, function (error: any, value: any) {
                    if (error) {
                        return reject(error);
                    }
                    return resolve(value);
                });
            });
        });
    };

    return {
        exec_workflow,
        execute_kw,
        connect,
        render_report,
        version,
        connection_parameters,
        api_wrapper,
    };
};
