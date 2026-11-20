// Personal UI cleanup, composed with app2smile's existing JSON ad filter.
function tiebaCleanUI(body, requestUrl) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
    const path = requestUrl.split('?')[0];
    if (/\/c\/u\/user\/profile$/.test(path)) {
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
