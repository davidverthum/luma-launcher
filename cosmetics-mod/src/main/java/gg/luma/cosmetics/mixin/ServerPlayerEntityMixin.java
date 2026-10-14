package gg.luma.cosmetics.mixin;

import gg.luma.cosmetics.server.Afk;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.text.Text;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** A player who stepped away reads «Rimfyy · отошёл» in everyone's Tab list. */
@Mixin(ServerPlayerEntity.class)
abstract class ServerPlayerEntityMixin {
	@Inject(method = "getPlayerListName", at = @At("RETURN"), cancellable = true)
	private void luma$afk(CallbackInfoReturnable<Text> cir) {
		ServerPlayerEntity self = (ServerPlayerEntity) (Object) this;
		if (Afk.isAfk(self)) cir.setReturnValue(Afk.listName(self, cir.getReturnValue()));
	}
}
