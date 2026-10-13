package gg.luma.menu.mixin;

import gg.luma.menu.Loading;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.DownloadingTerrainScreen;
import net.minecraft.client.gui.screen.MessageScreen;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.text.Text;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** «Loading terrain» and the plain message screens («Saving world»…) draw their own background:
 * Luma's night instead. */
@Mixin({DownloadingTerrainScreen.class, MessageScreen.class})
abstract class LoadingScreensMixin extends Screen {
	LoadingScreensMixin(Text title) {
		super(title);
	}

	@Inject(method = "renderBackground", at = @At("HEAD"), cancellable = true)
	private void luma$backdrop(DrawContext ctx, int mouseX, int mouseY, float delta, CallbackInfo ci) {
		// A message screen centres its text: the island stays faint behind it.
		Loading.render(ctx, width, height, (Object) this instanceof MessageScreen ? 0.35f : 1f);
		ci.cancel();
	}
}
