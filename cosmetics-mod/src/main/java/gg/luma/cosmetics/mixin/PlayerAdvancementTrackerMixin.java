package gg.luma.cosmetics.mixin;

import gg.luma.cosmetics.server.Chronicle;
import net.minecraft.advancement.AdvancementEntry;
import net.minecraft.advancement.PlayerAdvancementTracker;
import net.minecraft.server.network.ServerPlayerEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** The moment an advancement completes — vanilla hands out its rewards exactly then, once — goes to the chronicle. */
@Mixin(PlayerAdvancementTracker.class)
abstract class PlayerAdvancementTrackerMixin {
	@Shadow
	private ServerPlayerEntity owner;

	@Inject(method = "grantCriterion", at = @At(value = "INVOKE",
		target = "Lnet/minecraft/advancement/AdvancementRewards;apply(Lnet/minecraft/server/network/ServerPlayerEntity;)V"))
	private void luma$completed(AdvancementEntry advancement, String criterion, CallbackInfoReturnable<Boolean> cir) {
		Chronicle.advancement(owner, advancement);
	}
}
