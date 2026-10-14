package gg.luma.cosmetics.client;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.network.ClientPlayerEntity;
import net.minecraft.client.network.ServerInfo;
import net.minecraft.client.resource.language.I18n;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.util.Identifier;
import net.minecraft.util.Util;
import net.minecraft.util.math.BlockPos;

/**
 * Where an F2 screenshot was taken, for the launcher's album: next to the picture, in
 * screenshots/.luma/<file>.json — the place, the world, the biome (in the game's language), the
 * time of day, the weather and who was around. The album shows it and opens the spot on the map.
 */
public final class ScreenshotPlace {
	private static final double AROUND = 48;

	public static void save(File png) {
		MinecraftClient client = MinecraftClient.getInstance();
		ClientPlayerEntity player = client.player;
		ClientWorld world = client.world;
		if (png == null || player == null || world == null) return;
		try {
			JsonObject o = new JsonObject();
			o.addProperty("version", 1);
			ServerInfo server = client.getCurrentServerEntry();
			o.addProperty("server", server == null || client.isInSingleplayer() ? "" : server.address);
			if (client.isInSingleplayer() && client.getServer() != null) o.addProperty("world", client.getServer().getSaveProperties().getLevelName());
			o.addProperty("dim", world.getRegistryKey().getValue().toString());
			BlockPos pos = player.getBlockPos();
			o.addProperty("x", pos.getX());
			o.addProperty("y", pos.getY());
			o.addProperty("z", pos.getZ());
			o.addProperty("yaw", Math.round(player.getYaw()));
			world.getBiome(pos).getKey().ifPresent(key -> {
				Identifier id = key.getValue();
				String tkey = "biome." + id.getNamespace() + "." + id.getPath();
				o.addProperty("biome", id.toString());
				o.addProperty("biomeName", I18n.hasTranslation(tkey) ? I18n.translate(tkey) : id.getPath());
			});
			o.addProperty("dayTime", Math.floorMod(world.getTimeOfDay(), 24000L));
			o.addProperty("weather", world.isThundering() ? "thunder" : world.isRaining() ? "rain" : "clear");
			JsonArray around = new JsonArray();
			for (AbstractClientPlayerEntity other : world.getPlayers()) {
				if (other != player && other.squaredDistanceTo(player) <= AROUND * AROUND) around.add(other.getName().getString());
			}
			o.add("players", around);
			Path file = png.toPath().resolveSibling(".luma").resolve(png.getName() + ".json");
			String body = o.toString();
			Util.getIoWorkerExecutor().execute(() -> {
				try {
					Files.createDirectories(file.getParent());
					Files.writeString(file, body);
				} catch (Exception e) {
					LumaCosmeticsClient.LOG.warn("Luma: couldn't note where {} was taken", png.getName(), e);
				}
			});
		} catch (RuntimeException e) {
			LumaCosmeticsClient.LOG.warn("Luma: couldn't note where {} was taken", png.getName(), e);
		}
	}

	private ScreenshotPlace() {}
}
