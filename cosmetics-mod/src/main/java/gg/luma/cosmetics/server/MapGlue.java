package gg.luma.cosmetics.server;

import com.google.gson.JsonObject;
import de.bluecolored.bluemap.api.BlueMapAPI;
import de.bluecolored.bluemap.api.BlueMapMap;
import de.bluecolored.bluemap.api.markers.MarkerSet;
import de.bluecolored.bluemap.api.markers.POIMarker;
import java.util.List;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.world.ServerWorld;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Everything that touches BlueMap: the places on the map, and its web folder for Web. Only loaded
 * when BlueMap is installed (LumaServer checks), so the mod runs fine without it.
 */
final class MapGlue {
	private static final Logger LOG = LoggerFactory.getLogger("luma-cosmetics");
	private static final String SET = "luma-places";
	private static volatile BlueMapAPI api;
	private static volatile MinecraftServer server;

	static void init() {
		BlueMapAPI.onEnable(a -> {
			api = a;
			Web.setRoot(a.getWebApp().getWebRoot());
			MinecraftServer s = server;
			if (s != null) s.execute(() -> sync(s));
			LOG.info("Luma: BlueMap is up — places go on the map, the launcher reads {}", a.getWebApp().getWebRoot().resolve("luma"));
		});
		BlueMapAPI.onDisable(a -> api = null);
	}

	static void attach(MinecraftServer s) {
		server = s;
		if (api != null) s.execute(() -> sync(s));
	}

	/** Puts the places on every map of their dimension and tells the launcher which map shows which dimension. */
	static void sync(MinecraftServer s) {
		BlueMapAPI a = api;
		if (a == null) return;
		List<Places.Place> places = Places.all();
		JsonObject maps = new JsonObject();
		for (ServerWorld world : s.getWorlds()) {
			String dim = world.getRegistryKey().getValue().toString();
			a.getWorld(world).ifPresent(bw -> {
				for (BlueMapMap map : bw.getMaps()) {
					if (!maps.has(dim)) maps.addProperty(dim, map.getId());
					MarkerSet set = map.getMarkerSets().computeIfAbsent(SET, id -> MarkerSet.builder().label("Места Luma").toggleable(true).build());
					set.getMarkers().clear();
					for (Places.Place p : places) {
						if (!p.dim().equals(dim)) continue;
						set.getMarkers().put("luma-" + p.id(), POIMarker.builder()
							.label(p.name() + " · " + p.owner())
							.detail("<b>" + escape(p.name()) + "</b><br>" + escape(p.owner()))
							.position(p.x() + 0.5, p.y() + 0.5, p.z() + 0.5)
							.build());
					}
				}
			});
		}
		Web.publish("maps.json", maps);
	}

	private static String escape(String s) {
		return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
	}

	private MapGlue() {}
}
