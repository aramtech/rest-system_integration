import path from "path";
import { src_path } from "../../../cli/utils/src_path/index.js";
import { compare_shallow_record } from "../../../common/index.js";
import { define } from "../../definer/index.js";
import { create_odoo_xmlrpc_client } from "./xmlrpc_adapter/index.js";

type OdooOperations = {
    version(): Promise<any>;
    get_xml_rpc_client(): Promise<ReturnType<typeof create_odoo_xmlrpc_client>>;
};
type OdooConfiguration = {
    host: string;
    db: string;
    secure: boolean;
    port: number;
    username: string;
    password: string;
    api_key: string;
};

export const odoo = await define<OdooOperations, OdooConfiguration>({
    build_operations(props) {
        async function get_url() {
            const config = await props.get_configuration();
            const url = `http${config.secure ? "s" : ""}://${config.host}${config.port == 80 ? "" : `:${config.port}`}/xmlrpc/2/common`
            console.log(url);
            return url;
        }

        let client_cache = null as null | ReturnType<typeof create_odoo_xmlrpc_client>;
        let client_config_cache: {
            db: string;
            password: string;
            url: string;
            username: string;
            port: number;
            secure: boolean;
        } | null = null;
        async function get_xml_rpc_client() {
            const config = await props.get_configuration();
            const url = await get_url();
            const current_client_config = {
                db: config.db,
                password: config.api_key,
                url: url,
                username: config.username,
                port: config.port,
                secure: config.secure,
            };
            if (
                client_cache &&
                client_config_cache &&
                compare_shallow_record(current_client_config, client_config_cache)
            ) {
                return client_cache;
            }
            client_config_cache = current_client_config;
            const odooClient = create_odoo_xmlrpc_client(current_client_config);
            client_cache = odooClient;
            return odooClient;
        }

        async function version() {}

        return {
            get_xml_rpc_client,
            version,
        };
    },
    definition_id: "OdooErp",
    definition_path: path.join(src_path, "systems/odoo"),
    test_connection: () => {
        return true;
    },
});
