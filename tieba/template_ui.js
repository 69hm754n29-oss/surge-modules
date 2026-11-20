// Personal UI cleanup, composed with app2smile's existing JSON ad filter.
function tiebaCleanUI(body, requestUrl) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
    const path = requestUrl.split('?')[0];
    if (/\/c\/s\/sync$/.test(path)) {
        if (Array.isArray(body.index_tab_info)) {
            body.index_tab_info = body.index_tab_info.filter(tab =>
                !tab || (tab.tab_code !== 'live' && String(tab.tab_type) !== '6'));
        }
        // Captured v1 response already removed live from index_tab_info, but
        // the native tab returned with default text. Its independent channel
        // eligibility remained enabled. This targeted fallback fix still
        // requires UI verification; do not disable unrelated A/B experiments.
        if (Object.prototype.hasOwnProperty.call(body, 'ala_channel_white')) {
            body.ala_channel_white = typeof body.ala_channel_white === 'number' ? 0 : '0';
        }
        if (body.top_level_navi && !Array.isArray(body.top_level_navi)) {
            delete body.top_level_navi['直播'];
        }
    } else if (/\/c\/u\/user\/profile$/.test(path)) {
        if (Array.isArray(body.zone_info)) {
            body.zone_info = body.zone_info.filter(zone =>
                !zone || !['commerce', 'banner', 'game', 'auxiliary_func'].includes(zone.type));
            for (const zone of body.zone_info) {
                if (zone && zone.type === 'common_func' && zone.common_func) {
                    const common = zone.common_func;
                    // [] left native placeholder tiles visible in the UI;
                    // omit the whole optional sub-layout instead.
                    delete common.common_func_other;
                    delete common.common_func_other_new;
                    if (Array.isArray(common.common_func_noraml)) {
                        common.common_func_noraml = common.common_func_noraml.filter(item =>
                            !item || !['装扮中心', '我的龙虾'].includes(item.name));
                    }
                }
            }
        }
        // Only the membership sales card, not the user's VIP status/identity.
        delete body.vip_banner;
    }
    return body;
}
