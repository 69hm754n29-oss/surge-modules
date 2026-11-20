// Personal UI cleanup, composed with app2smile's existing JSON ad filter.
function tiebaCleanUI(body, requestUrl) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
    const path = requestUrl.split('?')[0];
    if (/\/c\/u\/user\/profile$/.test(path)) {
        if (Array.isArray(body.zone_info)) {
            // Native common_func draws blank tiles even when its expanded
            // list is absent. Use the other native grid, outside_tools, for
            // these three shortcuts instead of rendering common_func at all.
            const keptNames = ['我的收藏', '我的点赞', '浏览历史'];
            const commonZone = body.zone_info.find(zone => zone && zone.type === 'common_func');
            if (commonZone) {
                const rows = commonZone.common_func?.common_func_noraml;
                const nativeLog = body.zone_info.find(zone => zone && zone.type === 'auxiliary_func')
                    ?.auxiliary_func?.log_param;
                const shortcuts = keptNames.map(name => Array.isArray(rows) && rows.find(item =>
                    item && item.name === name && item.schema && item.icon));
                if (shortcuts.every(Boolean)) {
                    const outside_tools = shortcuts.map(item => {
                        const tool = {name: item.name, schema: item.schema, icon: item.icon,
                                      dark_icon: item.dark_icon || item.icon};
                        if (item.ios_schema) tool.ios_schema = item.ios_schema;
                        if (item.theme_color_info) tool.theme_color_info = item.theme_color_info;
                        return tool;
                    });
                    body.zone_info = body.zone_info.flatMap(zone => {
                        if (zone === commonZone) {
                            return [{type: 'auxiliary_func', auxiliary_func: {outside_tools,
                                log_param: Array.isArray(nativeLog) ? nativeLog :
                                    [{key: 'card_type', value: 'auxiliary_func'}]}}];
                        }
                        return zone && ['common_func', 'commerce', 'banner', 'game', 'auxiliary_func'].includes(zone.type)
                            ? [] : [zone];
                    });
                } else {
                    // Unknown profile shape: don't drop the ordinary shortcuts.
                    const common = commonZone.common_func;
                    if (common) {
                        delete common.common_func_other;
                        delete common.common_func_other_new;
                        if (Array.isArray(rows)) common.common_func_noraml = rows.filter(item =>
                            !item || !['装扮中心', '我的龙虾'].includes(item.name));
                    }
                    body.zone_info = body.zone_info.filter(zone =>
                        !zone || !['commerce', 'banner', 'game', 'auxiliary_func'].includes(zone.type));
                }
            } else {
                // Keep the composed grid on repeated processing, never the stock auxiliary tools.
                body.zone_info = body.zone_info.filter(zone => {
                    if (!zone || !['commerce', 'banner', 'game', 'auxiliary_func'].includes(zone.type)) return true;
                    const tools = zone.auxiliary_func?.outside_tools;
                    return zone.type === 'auxiliary_func' && Array.isArray(tools) &&
                        tools.length === keptNames.length && tools.every((tool, i) => tool?.name === keptNames[i]);
                });
            }
        }
        // The profile header gradient shares the response object with the
        // membership promo. Keep only the full-width header backgrounds.
        if (body.vip_banner && typeof body.vip_banner === 'object') {
            const backgrounds = {};
            for (const key of ['background_day', 'background_night']) {
                const value = body.vip_banner[key];
                if (typeof value === 'string' && value) backgrounds[key] = value;
            }
            if (Object.keys(backgrounds).length) body.vip_banner = backgrounds;
            else delete body.vip_banner;
        } else {
            delete body.vip_banner;
        }
    }
    return body;
}
