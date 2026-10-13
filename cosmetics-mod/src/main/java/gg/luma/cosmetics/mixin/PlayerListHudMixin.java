package gg.luma.cosmetics.mixin;

import gg.luma.cosmetics.client.Badges;
import net.minecraft.client.gui.hud.PlayerListHud;
import net.minecraft.client.network.PlayerListEntry;
import net.minecraft.text.Text;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** The Tab list shows the same crown and name color as the name over the head. */
@Mixin(PlayerListHud.class)
abstract class PlayerListHudMixin {
	@Inject(method = "getPlayerName", at = @At("RETURN"), cancellable = true)
	private void luma$name(PlayerListEntry entry, CallbackInfoReturnable<Text> cir) {
		cir.setReturnValue(Badges.name(entry.getProfile().getId(), cir.getReturnValue()));
	}
}
