package gg.luma.menu.mixin;

import gg.luma.menu.Loading;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.DisconnectedScreen;
import net.minecraft.client.gui.screen.ReconfiguringScreen;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.screen.multiplayer.ConnectScreen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Connecting to the server, its reconfiguration and «disconnected» get Luma's night instead of the panorama. */
@Mixin(Screen.class)
abstract class ScreenMixin {
	@Shadow
	public int width;
	@Shadow
	public int height;

	@Inject(method = "renderBackground", at = @At("HEAD"), cancellable = true)
	private void luma$backdrop(DrawContext ctx, int mouseX, int mouseY, float delta, CallbackInfo ci) {
		Object self = this;
		if (self instanceof ConnectScreen || self instanceof ReconfiguringScreen) {
			Loading.render(ctx, width, height, 1f);
			ci.cancel();
		} else if (self instanceof DisconnectedScreen) {
			// Its reason and button sit in the middle: the island stays faint behind them.
			Loading.render(ctx, width, height, 0.35f);
			ci.cancel();
		}
	}
}
