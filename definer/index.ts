import fs from "fs";
import path from "path";
import { env } from "../../../env.js";
import ObjectError from "../../ObjectError/index.js";
import { JSONObject } from "../../common/index.js";
import { hashWithSHA256 } from "../../crypto/hash.js";
import make_threaded_json, {
    JSONSourceFilePath,
    OptionsNoBroadCast,
    ThreadedJson,
} from "../../dynamic_json/threaded_json.js";
type SystemIntegrationRegistrationProps<Configuration extends { [key: string]: any }> = {
    connection_id: string;
    config: Configuration;
};

type Instance<
    OperationsType extends {
        [key: string]: (...args: any) => Promise<any>;
    },
    Configuration extends any,
> = {
    is_active: () => Promise<boolean>;
    operations: OperationsType;
    test_connection: () => Promise<boolean>;
    deactivate: () => Promise<void>;
    activate: () => Promise<void>;
    instance_paths: {
        directory: string;
        config_full_path: JSONSourceFilePath;
    };
    instance_config_threaded_json: ThreadedJson<JSONSourceFilePath, unknown>;
    get_config: () => Promise<Configuration>;
    update_config(new_config: Configuration): Promise<void>;
};

type SystemIntegrationDefinitionProps<
    OperationsType extends {
        [key: string]: (...args: any) => any;
    },
    Configuration extends JSONObject,
> = {
    /**
     * system definition simple id such as "OdooErp"
     */
    definition_id: string;

    /**
     * the absolute directory path to were to store configurations and definitions files
     */
    definition_path: string;

    /**
     * connection test method should be simple and fast, it should check if the remote system is reachable.
     */
    test_connection: (config: Configuration) => boolean | Promise<boolean>;

    /**
     * define the operation performed on the instance, 
     * in short what can you do remotely, 
     * and why are you building the remote connection in the first place
     *
     * @param props
     * @returns
     */
    build_operations: (props: {
        get_configuration: () => Promise<Configuration>;
    }) => Promise<OperationsType> | OperationsType;
};

export const define = async <
    OperationsType extends {
        [key: string]: (...args: any) => Promise<any>;
    },
    Configuration extends JSONObject,
>(
    system_definition: SystemIntegrationDefinitionProps<OperationsType, Configuration>,
) => {
    type MainConfig = {
        definition_id: string;
        instances: {
            [instance_id: string]: {
                instance_configuration_path: string;
                active: boolean;
            };
        };
    };

    function get_main_config_file_path(): JSONSourceFilePath {
        const definition_json_path = path.join(system_definition.definition_path, "main.json");
        return definition_json_path as JSONSourceFilePath;
    }

    function get_instances_dir_path() {
        return path.join(system_definition.definition_path, "instances");
    }

    function create_configuration_schema() {
        const config_path = get_main_config_file_path();
        const config_file_exists = fs.existsSync(config_path);
        if (!config_file_exists) {
            const config_path_dir = path.dirname(config_path);
            if (!fs.existsSync(config_path_dir)) {
                fs.mkdirSync(config_path_dir, {
                    recursive: true,
                });
            }
            fs.writeFileSync(
                path.join(config_path_dir, ".gitignore"),
                `
main.json


!**/.gitignore
`,
            );

            fs.writeFileSync(
                config_path,
                JSON.stringify(
                    {
                        definition_id: system_definition.definition_id,
                        instances: {},
                    },
                    null,
                    4,
                ),
            );
            const instances_dir_path = get_instances_dir_path();
            fs.mkdirSync(instances_dir_path, { recursive: true });
            fs.writeFileSync(
                path.join(instances_dir_path, ".gitignore"),
                `
*.*
**/*.*

!**/.gitignore
`,
            );
        }
    }

    create_configuration_schema();

    const main_config_threaded_json = await make_threaded_json<
        MainConfig,
        JSONSourceFilePath,
        OptionsNoBroadCast<string>
    >(get_main_config_file_path(), {
        lazy: false,
        unique_event_number: `system_integration_instance:${system_definition.definition_id}`,
        broadcast_on_update: false,
    });

    async function get_main_config() {
        const configuration: MainConfig = await main_config_threaded_json.get([]);
        return configuration;
    }

    function get_instance_configuration_file_path(id: string) {
        if (id.length < 3) {
            throw new ObjectError({
                error: {
                    msg: "Connection instance identifier must be longer than 3 characters",
                },
                status_code: env.response.status_codes.invalid_data,
            });
        }
        const file_name = hashWithSHA256(id);
        return {
            directory: path.join(get_instances_dir_path(), file_name),
            config_full_path: path.join(get_instances_dir_path(), file_name, `config.json`) as JSONSourceFilePath,
        };
    }

    async function update_main_config(main_config: MainConfig) {
        return await main_config_threaded_json.update_json_from_provided(main_config);
    }

    async function register_instance_configuration(props: SystemIntegrationRegistrationProps<Configuration>) {
        const main_config = await get_main_config();

        if (main_config.instances[props.connection_id]) {
            throw new ObjectError({
                status_code: env.response.status_codes.invalid_data,
                error: {
                    msg: "this connection id already used in " + system_definition.definition_id,
                },
            });
        }
        const instance_configuration_file_path = get_instance_configuration_file_path(props.connection_id);
        main_config.instances[props.connection_id] = {
            instance_configuration_path: instance_configuration_file_path.config_full_path,
            active: true,
        };
        await update_main_config(main_config);
        fs.mkdirSync(instance_configuration_file_path.directory, { recursive: true });
        fs.writeFileSync(instance_configuration_file_path.config_full_path, JSON.stringify(props.config));
    }

    async function update_instance_configuration(id: string, new_configuration: Configuration) {
        create_configuration_schema();
        const main_config = await get_main_config();
        if (!main_config.instances[id]) {
            throw new ObjectError({
                error: {
                    msg: "integration instance with id " + id + " is not registered",
                },
                status_code: env.response.status_codes.not_found,
            });
        }
        const instance_configuration_file_path = get_instance_configuration_file_path(id);
        fs.mkdirSync(instance_configuration_file_path.directory, { recursive: true });
        fs.writeFileSync(instance_configuration_file_path.config_full_path, JSON.stringify(new_configuration));
    }

    function get_instance_configuration(id: string): Configuration | null {
        const config_path = get_instance_configuration_file_path(id);
        if (!fs.existsSync(config_path.config_full_path)) {
            return null;
        }
        return JSON.parse(fs.readFileSync(config_path.config_full_path, "utf-8")) as Configuration;
    }

    async function is_instance_active(id: string) {
        const main_config = await get_main_config();
        return !!main_config.instances[id]?.active;
    }

    const instancesMap = {} as Record<string, Instance<OperationsType, Configuration>>;

    async function get_instance(id: string): Promise<Instance<OperationsType, Configuration> | null> {
        const main_config = await get_main_config();
        if (!main_config.instances[id]) {
            return null;
        }

        if (instancesMap[id]) {
            return instancesMap[id];
        }

        const instance_paths = get_instance_configuration_file_path(id);
        const instance_config_threaded_json = await make_threaded_json(instance_paths.config_full_path, {
            broadcast_on_update: false,
            unique_event_number: `connection_instance:${system_definition.definition_id}:${id}:config`,
        });
        const instance_status_threaded_json = await make_threaded_json(
            {
                last_known_status: "unknown" as "working" | "not-working" | "unknown",
            },
            {
                file_path: path.join(instance_paths.directory, "status.json") as JSONSourceFilePath,
                unique_event_number: `connection_instance:${system_definition.definition_id}:${id}:status`,
                lazy: false,
                broadcast_on_update: false,
            },
        );

        const update_last_known_status = async (status: "working" | "not-working" | "unknown") => {
            await instance_status_threaded_json.set([], "last_known_status", status);
        };

        const validate_is_active = async () => {
            const active = await is_instance_active(id);
            if (!active) {
                throw new ObjectError({
                    error: {
                        msg: `connection instance ${id} is deactivated`,
                    },
                    status_code: env.response.status_codes.action_not_authorized,
                });
            }
        };
        const wrapped_operations = Object.fromEntries(
            Object.entries(
                await system_definition.build_operations({
                    get_configuration: () => instance_config_threaded_json.get([]) as Promise<Configuration>,
                }),
            ).map(([key, operation]) => {
                return [
                    key,
                    async (...args: any) => {
                        await validate_is_active();
                        try {
                            const result = await operation(...args);
                            update_last_known_status("working");
                            return result;
                        } catch (error) {
                            update_last_known_status("not-working");
                            throw error;
                        }
                    },
                ];
            }),
        );
        const get_config = async () => {
            return (await instance_config_threaded_json.get([])) as Configuration;
        };
        async function test_connection() {
            await validate_is_active();
            const success = system_definition.test_connection(await get_config());
            update_last_known_status(success ? "working" : "not-working");
            return success;
        }
        const instance: Instance<OperationsType, Configuration> = {
            async update_config(new_config: Configuration) {
                return await instance_config_threaded_json.update_json_from_provided(new_config);
            },
            activate: async () => {
                const main_config = await get_main_config();
                if (main_config.instances[id]) {
                    if (!main_config.instances[id].active) {
                        main_config.instances[id].active = true;
                        await update_main_config(main_config);
                    }
                }
            },
            is_active: () => is_instance_active(id),
            get_config,
            instance_paths,
            instance_config_threaded_json,
            deactivate: async () => {
                const main_config = await get_main_config();
                if (main_config.instances[id]) {
                    if (main_config.instances[id].active) {
                        main_config.instances[id].active = false;
                        await update_main_config(main_config);
                    }
                }
            },
            test_connection,
            operations: wrapped_operations as OperationsType,
        };
        instancesMap[id] = instance;

        return instance;
    }

    async function get_or_register_instance(props: SystemIntegrationRegistrationProps<Configuration>) {
        const result = await system_definition.test_connection(props.config);
        if (result) {
            const existing_instance = await get_instance(props.connection_id);
            if (existing_instance) {
                await existing_instance.update_config(props.config);
                return existing_instance;
            } else {
                await register_instance_configuration(props);
                return (await get_instance(props.connection_id)) as Instance<OperationsType, Configuration>;
            }
        } else {
            throw new ObjectError({
                error: {
                    msg: "connection test failed",
                },
                status_code: env.response.status_codes.remote_call_error,
            });
        }
    }

    async function register(props: SystemIntegrationRegistrationProps<Configuration>) {
        const result = await system_definition.test_connection(props.config);
        if (result) {
            await register_instance_configuration(props);
            return await get_instance(props.connection_id);
        } else {
            throw new ObjectError({
                error: {
                    msg: "connection test failed",
                },
                status_code: env.response.status_codes.remote_call_error,
            });
        }
    }

    return {
        register,
        get_or_register_instance,
        get_instance,
        main_config_threaded_json,
        update_main_config,
        update_instance_configuration,
        is_instance_active,
        get_main_config,
        get_instance_configuration,
    };
};
