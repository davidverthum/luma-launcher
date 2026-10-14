package gg.luma.cosmetics.client;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import gg.luma.cosmetics.ModsPayload;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.loader.api.ModContainer;
import net.fabricmc.loader.api.metadata.ModOrigin;
import net.minecraft.client.MinecraftClient;

/**
 * Tells the server which mods this game runs, once per connection, for the admin's «Проверка
 * сборки». Which jars are the pack's comes from the launcher (config/luma-pack.json); the rest
 * are the player's own. Only top-level mods: libraries bundled inside a jar come with it.
 */
final class ModReport {
	private static final Path PACK = FabricLoader.getInstance().getConfigDir().resolve("luma-pack.json");
	private static final Set<String> BUILTIN = Set.of("minecraft", "java", "fabricloader", "mixinextras");
	private static boolean sent;

	static void reset() {
		sent = false;
	}

	static void tick(MinecraftClient client) {
		if (sent || client.getNetworkHandler() == null || !ClientPlayNetworking.canSend(ModsPayload.ID)) return;
		sent = true;
		ClientPlayNetworking.send(build());
	}

	private static ModsPayload build() {
		Set<String> pack = packFiles();
		List<ModsPayload.Mod> mods = new ArrayList<>();
		for (ModContainer mod : FabricLoader.getInstance().getAllMods()) {
			if (mod.getContainingMod().isPresent()) continue;
			String id = mod.getMetadata().getId();
			if (BUILTIN.contains(id)) continue;
			String file = "";
			ModOrigin origin = mod.getOrigin();
			if (origin.getKind() == ModOrigin.Kind.PATH && !origin.getPaths().isEmpty()) file = origin.getPaths().get(0).getFileName().toString();
			boolean own = pack != null && !pack.contains(file);
			mods.add(new ModsPayload.Mod(cut(id), cut(mod.getMetadata().getVersion().getFriendlyString()), own));
			if (mods.size() >= ModsPayload.MAX) break;
		}
		return new ModsPayload(pack != null, mods);
	}

	/** The jar names the launcher installed (pack and switched-on optional mods); null — not told. */
	private static Set<String> packFiles() {
		try {
			if (!Files.exists(PACK)) return null;
			JsonObject o = JsonParser.parseString(Files.readString(PACK)).getAsJsonObject();
			Set<String> files = new HashSet<>();
			for (JsonElement e : o.getAsJsonArray("files")) files.add(e.getAsString());
			return files;
		} catch (Exception e) {
			return null;
		}
	}

	private static String cut(String s) {
		return s.length() > 64 ? s.substring(0, 64) : s;
	}

	private ModReport() {}
}
