// Personal UI cleanup, composed with app2smile's existing JSON ad filter.
function tiebaCleanUI(body, requestUrl) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
    const path = requestUrl.split('?')[0];
    if (/\/c\/s\/sync$/.test(path)) {
        if (Array.isArray(body.index_tab_info)) {
            body.index_tab_info = body.index_tab_info.filter(tab =>
                !tab || tab.tab_code !== 'live');
        }
    } else if (/\/c\/u\/user\/profile$/.test(path)) {
        if (Array.isArray(body.zone_info)) {
            body.zone_info = body.zone_info.filter(zone =>
                !zone || !['commerce', 'banner', 'game'].includes(zone.type));
            for (const zone of body.zone_info) {
                if (zone && zone.type === 'common_func' && zone.common_func &&
                    Array.isArray(zone.common_func.common_func_other)) {
                    zone.common_func.common_func_other = [];
                }
            }
        }
        // Only the membership sales card, not the user's VIP status/identity.
        delete body.vip_banner;
    }
    return body;
}
