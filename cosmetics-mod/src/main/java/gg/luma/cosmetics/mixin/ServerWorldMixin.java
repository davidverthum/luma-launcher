package gg.luma.cosmetics.mixin;

import gg.luma.cosmetics.server.Afk;
import java.util.List;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyArg;

/** Someone who stepped away doesn't hold the night up: they're left out of «enough players asleep». */
@Mixin(ServerWorld.class)
abstract class ServerWorldMixin {
	@ModifyArg(method = "updateSleepingPlayers", at = @At(value = "INVOKE",
		target = "Lnet/minecraft/server/world/SleepManager;update(Ljava/util/List;)Z"))
	private List<ServerPlayerEntity> luma$awakeOnly(List<ServerPlayerEntity> players) {
		return players.stream().filter(p -> !Afk.isAfk(p)).toList();
	}
}
