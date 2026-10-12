package gg.luma.cosmetics.client;

import gg.luma.cosmetics.Cosmetics;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderContext;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.client.render.entity.EntityRenderDispatcher;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.passive.PassiveEntity;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Pets: one mob per player that wears one, made on this client only and never added to the
 * world — no collisions, no damage, nothing the server or other mods see. It trots beside its
 * owner and hides while they sneak or are invisible, so it never gives a hiding player away.
 */
final class Pets {
	private record Pet(String kind, Entity entity) {}

	private static final Map<UUID, Pet> PETS = new HashMap<>();
	private static final Logger LOG = LoggerFactory.getLogger("luma-cosmetics");
	/** Runs every frame for every player: if a pet ever fails, pets switch off rather than crash the game. */
	private static boolean broken;

	private static void fail(Throwable t) {
		broken = true;
		PETS.clear();
		LOG.error("Luma Cosmetics: pets switched off after an error", t);
	}

	static void clear() {
		PETS.clear();
	}

	private static EntityType<?> type(String id) {
		return switch (id) {
			case "fox" -> EntityType.FOX;
			case "cat" -> EntityType.CAT;
			case "axolotl" -> EntityType.AXOLOTL;
			case "parrot" -> EntityType.PARROT;
			case "bee" -> EntityType.BEE;
			case "frog" -> EntityType.FROG;
			case "rabbit" -> EntityType.RABBIT;
			case "chicken" -> EntityType.CHICKEN;
			default -> null;
		};
	}

	private static boolean flies(String id) {
		return id.equals("parrot") || id.equals("bee");
	}

	private static Entity make(ClientWorld world, String id) {
		EntityType<?> type = type(id);
		Entity e = type == null ? null : type.create(world);
		if (e == null) return null;
		if (e instanceof PassiveEntity baby && !id.equals("parrot") && !id.equals("frog")) baby.setBaby(true);
		e.setSilent(true);
		e.setNoGravity(true);
		return e;
	}

	private static boolean hidden(AbstractClientPlayerEntity p) {
		return p.isInvisible() || p.isSneaking() || p.isSpectator();
	}

	static void tick(MinecraftClient client) {
		if (broken) return;
		try {
			tickPets(client);
		} catch (Throwable t) {
			fail(t);
		}
	}

	private static void tickPets(MinecraftClient client) {
		ClientWorld world = client.world;
		if (world == null) {
			PETS.clear();
			return;
		}
		if (client.isPaused()) return;
		PETS.keySet().removeIf(owner -> world.getPlayerByUuid(owner) == null);
		for (AbstractClientPlayerEntity player : world.getPlayers()) {
			Cosmetics.Choice choice = LumaCosmeticsClient.WORN.get(player.getUuid());
			if (choice == null || choice.pet().isEmpty()) {
				PETS.remove(player.getUuid());
				continue;
			}
			Pet pet = PETS.get(player.getUuid());
			if (pet == null || !pet.kind().equals(choice.pet()) || pet.entity().getWorld() != world) {
				Entity e = make(world, choice.pet());
				if (e == null) continue;
				pet = new Pet(choice.pet(), e);
				PETS.put(player.getUuid(), pet);
				place(pet, player, true);
			} else {
				place(pet, player, false);
			}
		}
	}

	/** Beside and a little behind the owner, on their right; flyers at shoulder height, bobbing. */
	private static void place(Pet pet, AbstractClientPlayerEntity owner, boolean snap) {
		Entity e = pet.entity();
		float yaw = owner.bodyYaw;
		double rad = Math.toRadians(yaw);
		double fx = -Math.sin(rad), fz = Math.cos(rad);
		double rx = -Math.cos(rad), rz = -Math.sin(rad);
		boolean fly = flies(pet.kind());
		double bob = fly ? Math.sin((e.age + owner.getId()) * 0.15) * 0.08 : 0;
		Vec3d target = owner.getPos().add(rx * 0.85 - fx * 0.35, (fly ? 1.15 : 0) + bob, rz * 0.85 - fz * 0.35);

		Vec3d now = e.getPos();
		Vec3d next = snap || now.squaredDistanceTo(target) > 16 ? target : now.add(target.subtract(now).multiply(0.35));
		e.prevX = now.x; e.prevY = now.y; e.prevZ = now.z;
		if (snap) { e.prevX = next.x; e.prevY = next.y; e.prevZ = next.z; }
		e.setPosition(next);
		e.prevYaw = e.getYaw();
		e.setYaw(yaw);
		e.age++;
		e.setOnGround(!fly);
		if (e instanceof LivingEntity living) {
			living.prevBodyYaw = living.bodyYaw;
			living.bodyYaw = yaw;
			living.prevHeadYaw = living.headYaw;
			living.headYaw = owner.headYaw;
			float moved = (float) Math.min(1.0, next.subtract(now).horizontalLength() * 4.0);
			living.limbAnimator.updateLimbs(moved, 0.4f);
		}
	}

	static void render(WorldRenderContext context) {
		if (broken) return;
		try {
			renderPets(context);
		} catch (Throwable t) {
			fail(t);
		}
	}

	private static void renderPets(WorldRenderContext context) {
		MinecraftClient client = MinecraftClient.getInstance();
		MatrixStack matrices = context.matrixStack();
		VertexConsumerProvider consumers = context.consumers();
		if (client.world == null || matrices == null || consumers == null || PETS.isEmpty()) return;
		float delta = context.tickCounter().getTickDelta(false);
		Vec3d cam = context.camera().getPos();
		EntityRenderDispatcher dispatcher = client.getEntityRenderDispatcher();
		for (AbstractClientPlayerEntity player : client.world.getPlayers()) {
			Pet pet = PETS.get(player.getUuid());
			if (pet == null || hidden(player)) continue;
			Entity e = pet.entity();
			double x = MathHelper.lerp(delta, e.prevX, e.getX());
			double y = MathHelper.lerp(delta, e.prevY, e.getY());
			double z = MathHelper.lerp(delta, e.prevZ, e.getZ());
			float yaw = MathHelper.lerpAngleDegrees(delta, e.prevYaw, e.getYaw());
			dispatcher.render(e, x - cam.x, y - cam.y, z - cam.z, yaw, delta, matrices, consumers, dispatcher.getLight(e, delta));
		}
	}

	private Pets() {}
}
