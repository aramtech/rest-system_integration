import path from "path";
import { src_path } from "../../../cli/utils/src_path/index.js";
import { compare_shallow_record } from "../../../common/index.js";
import { define } from "../../definer/index.js";
import { create_odoo_xmlrpc_client } from "./xmlrpc_adapter/index.js";

type OdooConfiguration = {
    host: string;
    db: string;
    secure: boolean;
    port: number;
    username: string;
    password: string;
    api_key: string;
};

function build_operations(props: { get_configuration: () => Promise<OdooConfiguration> }) {
    async function get_url() {
        const config = await props.get_configuration();
        const url = `http${config.secure ? "s" : ""}://${config.host}${config.port == 80 ? "" : `:${config.port}`}/xmlrpc/2/common`;
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
            password: config.password,
            url: url,
            username: config.username,
            port: config.port,
            secure: config.secure,
        };
        if (client_cache && client_config_cache && compare_shallow_record(current_client_config, client_config_cache)) {
            return client_cache;
        }
        client_config_cache = current_client_config;
        const odooClient = create_odoo_xmlrpc_client(current_client_config);
        client_cache = odooClient;
        return odooClient;
    }

    async function version() {
        const client = await get_xml_rpc_client();
        const version_info = await client.version();
        return version_info;
    }

    const stock_picking_type_barcode_to_id_map = {
        "WH-DELIVERY": 2,
        "WH-RECEIPTS": 1,
        "WH-PICK": 3,
        "WH-PACK": 4,
        "WH-INTERNAL": 5,
        "CHIC1-PACK": 9,
        "CHIC1-RECEIPTS": 6,
        "CHIC1-DELIVERY": 7,
        "CHIC1-PICK": 8,
    };

    async function get_stock_picking_by_name(name: string, type?: keyof typeof stock_picking_type_barcode_to_id_map) {
        const client = await get_xml_rpc_client();

        const picking_record = (
            await client.execute_kw({
                method: "search_read",
                model: "stock.picking",
                params: [
                    [
                        [
                            ["name", "=", name],
                            !!type && ["picking_type_id", "=", stock_picking_type_barcode_to_id_map[type]],
                        ].filter((e) => !!e),
                    ], // domain query
                ],
            })
        )?.[0] as typeof stock_picking_sample;

        const moves_records: (typeof picking_move_sample)[] = await client.execute_kw({
            method: "search_read",
            model: "stock.move",
            params: [
                [[["id", "in", picking_record.move_ids]].filter((e) => !!e)], // domain query
            ],
        });

        const moves_with_lines_records = await Promise.all(
            moves_records.map(async (m) => {
                const lines: (typeof stock_picking_move_line_sample)[] = await client.execute_kw({
                    method: "search_read",
                    model: "stock.move.line",
                    params: [
                        [[["id", "in", m.move_line_ids]].filter((e) => !!e)], // domain query
                    ],
                });

                return {
                    ...m,
                    lines: lines,
                };
            }),
        );

        return {
            ...picking_record,
            moves: moves_with_lines_records,
        };
    }

    return {
        get_xml_rpc_client,
        version,
        get_stock_picking_by_name,
    };
}

const stock_picking_move_line_sample = {
    id: 38,
    picking_id: [5, "WH/OUT/00005"],
    move_id: [46, "outgoing shipment/E-COM12: Stock>Customers"],
    company_id: [1, "My Company (San Francisco)"],
    product_id: [23, "[E-COM12] Conference Chair (Steel)"],
    product_uom_id: [1, "Units"],
    product_uom_category_id: [1, "Unit"],
    product_category_name: "All / Saleable / Office Furniture",
    quantity: 14,
    quantity_product_uom: 14,
    picked: false,
    package_id: false,
    package_level_id: false,
    lot_id: false,
    lot_name: false,
    result_package_id: false,
    date: "2024-08-25 12:24:52",
    owner_id: false,
    location_id: [8, "WH/Stock"],
    location_dest_id: [5, "Partners/Customers"],
    location_usage: "internal",
    location_dest_usage: "customer",
    lots_visible: false,
    picking_partner_id: [9, "Wood Corner"],
    picking_code: "outgoing",
    picking_type_id: [2, "YourCompany: Delivery Orders"],
    picking_type_use_create_lots: false,
    picking_type_use_existing_lots: true,
    picking_type_entire_packs: false,
    state: "partially_available",
    is_inventory: false,
    is_locked: true,
    consume_line_ids: [],
    produce_line_ids: [],
    reference: "WH/OUT/00005",
    tracking: "none",
    origin: false,
    description_picking: false,
    quant_id: false,
    product_packaging_qty: 0,
    picking_location_id: [8, "WH/Stock"],
    picking_location_dest_id: [5, "Partners/Customers"],
    display_name: "[E-COM12] Conference Chair (Steel)",
    create_uid: [2, "Mitchell Admin"],
    create_date: "2024-08-25 12:24:52",
    write_uid: [2, "Mitchell Admin"],
    write_date: "2024-08-25 12:24:52",
};

const stock_picking_sample = {
    id: 5,
    activity_ids: [],
    activity_state: false,
    activity_user_id: false,
    activity_type_id: false,
    activity_type_icon: false,
    activity_date_deadline: false,
    my_activity_date_deadline: false,
    activity_summary: false,
    activity_exception_decoration: false,
    activity_exception_icon: false,
    message_is_follower: false,
    message_follower_ids: [5],
    message_partner_ids: [9],
    message_ids: [91],
    has_message: true,
    message_needaction: false,
    message_needaction_counter: 0,
    message_has_error: false,
    message_has_error_counter: 0,
    message_attachment_count: 0,
    website_message_ids: [],
    message_has_sms_error: false,
    name: "WH/OUT/00005",
    origin: "outgoing shipment",
    note: false,
    backorder_id: false,
    backorder_ids: [],
    return_id: false,
    return_ids: [],
    return_count: 0,
    move_type: "direct",
    state: "assigned",
    group_id: false,
    priority: "0",
    scheduled_date: "2024-08-27 11:57:42",
    date_deadline: false,
    has_deadline_issue: false,
    date: "2024-08-24 11:57:42",
    date_done: false,
    delay_alert_date: false,
    json_popover: false,
    location_id: [8, "WH/Stock"],
    location_dest_id: [5, "Partners/Customers"] as [number, string],
    move_ids: [23] as number[],
    move_ids_without_package: [23] as number[],
    has_scrap_move: false,
    picking_type_id: [2, "YourCompany: Delivery Orders"] as [number, string],
    picking_type_code: "outgoing",
    picking_type_entire_packs: false,
    use_create_lots: false,
    use_existing_lots: true,
    hide_picking_type: false,
    partner_id: [9, "Wood Corner"],
    company_id: [1, "My Company (San Francisco)"] as [number, string],
    user_id: false,
    move_line_ids: [21] as number[],
    move_line_ids_without_package: [21] as number[],
    move_line_exist: true,
    has_packages: false,
    show_check_availability: false,
    show_allocation: false,
    owner_id: false,
    printed: false,
    signature: false,
    is_signed: false,
    is_locked: true,
    product_id: [8, "[FURN_7800] Desk Combination"] as [number, string],
    lot_id: false,
    show_operations: false,
    show_reserved: true,
    show_lots_text: false,
    has_tracking: false,
    package_level_ids: [],
    package_level_ids_details: [],
    products_availability: "Available",
    products_availability_state: "available",
    show_set_qty_button: false,
    show_clear_qty_button: false,
    picking_properties: [],
    display_name: "WH/OUT/00005",
    create_uid: [1, "OdooBot"] as [number, string],
    create_date: "2024-08-24 11:57:37",
    write_uid: [1, "OdooBot"] as [number, string],
    write_date: "2024-08-24 11:57:37",
};

export const odoo = await define<ReturnType<typeof build_operations>, OdooConfiguration>({
    build_operations,
    definition_id: "OdooErp",
    definition_path: path.join(src_path, "systems/odoo"),
    test_connection: () => {
        return true;
    },
});

const picking_move_sample = {
    id: 46,
    name: "[E-COM12] Conference Chair (Steel)",
    sequence: 10,
    priority: "0",
    date: "2024-08-27 11:57:42",
    date_deadline: false,
    company_id: [1, "My Company (San Francisco)"] as [number, string],
    product_id: [23, "[E-COM12] Conference Chair (Steel)"] as [number, string],
    description_picking: "Conference Chair",
    product_qty: 15,
    product_uom_qty: 15,
    product_uom: [1, "Units"] as [number, string],
    product_uom_category_id: [1, "Unit"] as [number, string],
    product_tmpl_id: [16, "Conference Chair"] as [number, string],
    location_id: [8, "WH/Stock"] as [number, string],
    location_dest_id: [5, "Partners/Customers"] as [number, string],
    location_usage: "internal",
    location_dest_usage: "customer",
    partner_id: [9, "Wood Corner"],
    move_dest_ids: [],
    move_orig_ids: [],
    picking_id: [5, "WH/OUT/00005"] as [number, string],
    state: "partially_available",
    picked: false,
    price_unit: 0,
    origin: false,
    procure_method: "make_to_stock",
    scrapped: false,
    scrap_id: false,
    group_id: false,
    rule_id: false,
    propagate_cancel: true,
    delay_alert_date: false,
    picking_type_id: [2, "YourCompany: Delivery Orders"] as [number, string],
    is_inventory: false,
    move_line_ids: [38],
    origin_returned_move_id: false,
    returned_move_ids: [],
    availability: 12,
    restrict_partner_id: false,
    route_ids: [],
    warehouse_id: false,
    has_tracking: "none",
    quantity: 14,
    show_operations: false,
    picking_code: "outgoing",
    show_details_visible: false,
    product_type: "product",
    additional: true,
    is_locked: true,
    is_initial_demand_editable: false,
    is_quantity_done_editable: true,
    reference: "WH/OUT/00005",
    move_lines_count: 1,
    package_level_id: false,
    picking_type_entire_packs: false,
    display_assign_serial: false,
    display_import_lot: false,
    next_serial: false,
    next_serial_count: 0,
    orderpoint_id: false,
    forecast_availability: 15,
    forecast_expected_date: false,
    lot_ids: [],
    reservation_date: false,
    product_packaging_id: false,
    product_packaging_qty: 0,
    product_packaging_quantity: 0,
    show_reserved: true,
    show_quant: true,
    show_lots_m2o: false,
    show_lots_text: false,
    display_name: "outgoing shipment/E-COM12: Stock>Customers",
    create_uid: [2, "Mitchell Admin"] as [number, string],
    create_date: "2024-08-25 12:24:52",
    write_uid: [2, "Mitchell Admin"] as [number, string],
    write_date: "2024-08-25 12:24:52",
};
