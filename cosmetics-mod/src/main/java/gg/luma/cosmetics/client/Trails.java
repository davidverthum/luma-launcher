package gg.luma.cosmetics.client;

import gg.luma.cosmetics.Cosmetics;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.option.ParticlesMode;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.particle.DustParticleEffect;
import net.minecraft.particle.ParticleEffect;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.util.math.random.Random;
import org.joml.Vector3f;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Trails: a few particles at the feet of a player who's moving. Drawn by each client for everyone
 * it sees, so they cost the server nothing. Off while the player sneaks or is invisible, and with
 * the «Particles: minimal» setting.
 */
final class Trails {
	private static final Logger LOG = LoggerFactory.getLogger("luma-cosmetics");
	/** Squared blocks per tick a player has to move to leave a trail. */
	private static final double MOVING = 0.0009;
	private static final Random RANDOM = Random.create();
	private static boolean broken;

	static void tick(MinecraftClient client) {
		if (broken) return;
		try {
			tickTrails(client);
		} catch (Throwable t) {
			broken = true;
			LOG.error("Luma Cosmetics: trails switched off after an error", t);
		}
	}

	private static void tickTrails(MinecraftClient client) {
		ClientWorld world = client.world;
		if (world == null || client.isPaused()) return;
		ParticlesMode mode = client.options.getParticles().getValue();
		if (mode == ParticlesMode.MINIMAL) return;
		for (AbstractClientPlayerEntity p : world.getPlayers()) {
			Cosmetics.Shown shown = LumaCosmeticsClient.SHOWN.get(p.getUuid());
			if (shown == null || shown.style().trail().isEmpty()) continue;
			if (p.isInvisible() || p.isSneaking() || p.isSpectator()) continue;
			double dx = p.getX() - p.prevX, dz = p.getZ() - p.prevZ;
			if (dx * dx + dz * dz < MOVING) continue;
			String trail = shown.style().trail();
			int every = trail.equals("notes") || trail.equals("hearts") ? 6 : 2;
			if (mode == ParticlesMode.DECREASED) every *= 2;
			if ((p.age + p.getId()) % every != 0) continue;
			spawn(world, p, trail, Cosmetics.COLORS.getOrDefault(shown.style().color(), 0xD4FF3D));
		}
	}

	private static void spawn(ClientWorld world, AbstractClientPlayerEntity p, String trail, int rgb) {
		double x = p.getX() + (RANDOM.nextDouble() - 0.5) * 0.5;
		double y = p.getY() + 0.1 + RANDOM.nextDouble() * 0.2;
		double z = p.getZ() + (RANDOM.nextDouble() - 0.5) * 0.5;
		ParticleEffect effect;
		double up = 0;
		switch (trail) {
			case "sparks" -> {
				effect = new DustParticleEffect(new Vector3f(((rgb >> 16) & 0xFF) / 255f, ((rgb >> 8) & 0xFF) / 255f, (rgb & 0xFF) / 255f), 0.9f);
				up = 0.02;
			}
			case "petals" -> effect = ParticleTypes.CHERRY_LEAVES;
			case "snow" -> effect = ParticleTypes.SNOWFLAKE;
			case "notes" -> {
				// A note's color comes from its x velocity: one of 24 pitches.
				world.addParticle(ParticleTypes.NOTE, x, y + 0.3, z, RANDOM.nextInt(24) / 24.0, 0, 0);
				return;
			}
			case "soul" -> {
				effect = ParticleTypes.SOUL_FIRE_FLAME;
				up = 0.015;
			}
			case "hearts" -> {
				effect = ParticleTypes.HEART;
				y += 0.3;
			}
			default -> {
				return;
			}
		}
		world.addParticle(effect, x, y, z, 0, up, 0);
	}

	private Trails() {}
}
