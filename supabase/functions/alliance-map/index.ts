import { handleOptions } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import { createServiceRoleClient } from '../_shared/supabaseClient.ts';

type AllianceMapRow = {
  country_code: string;
  country_name: string;
  city_name: string | null;
  latitude: number | null;
  longitude: number | null;
  alliances: {
    id: string;
    name: string;
    color: string | null;
    icon_key: string | null;
  } | null;
};

type AllianceMapItem = {
  countryCode: string;
  countryName: string;
  cityName: string | null;
  latitude: number | null;
  longitude: number | null;
  alliance: {
    id: string;
    name: string;
    color: string;
    iconKey: string;
  } | null;
};

type AllianceMapResponse = {
  items: AllianceMapItem[];
};

const ALLIANCE_MAP_SELECT = `
  country_code,
  country_name,
  city_name,
  latitude,
  longitude,
  alliances (
    id,
    name,
    color,
    icon_key
  )
`;

function toNumber(value: number | string | null): number | null {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function mapAllianceItem(row: AllianceMapRow): AllianceMapItem {
  return {
    countryCode: row.country_code,
    countryName: row.country_name,
    cityName: row.city_name,
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    alliance: row.alliances
      ? {
          id: row.alliances.id,
          name: row.alliances.name,
          color: row.alliances.color ?? '#9fb5c1',
          iconKey: row.alliances.icon_key ?? 'alliance-neutral',
        }
      : null,
  };
}

Deno.serve(async (request) => {
  const optionsResponse = handleOptions(request);

  if (optionsResponse) {
    return optionsResponse;
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
    return errorResponse(request, 'METHOD_NOT_ALLOWED', '只支持 GET 或 POST 请求。', 405);
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('country_alliance_map')
    .select(ALLIANCE_MAP_SELECT)
    .order('country_code', { ascending: true })
    .returns<AllianceMapRow[]>();

  if (error || !data) {
    console.error('ALLIANCE_MAP_QUERY_FAILED', error);
    return errorResponse(request, 'ALLIANCE_MAP_FAILED', '读取国家联盟映射失败。', 500);
  }

  return successResponse(
    request,
    {
      items: data.map(mapAllianceItem),
    } satisfies AllianceMapResponse,
  );
});
