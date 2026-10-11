package gg.luma.menu.mixin;

import gg.luma.menu.LumaTitleScreen;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.screen.TitleScreen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

@Mixin(MinecraftClient.class)
abstract class MinecraftClientMixin {
	/** Every way to the title screen — start-up, leaving a world or the server — lands on Luma's. */
	@ModifyVariable(method = "setScreen", at = @At("HEAD"), argsOnly = true)
	private Screen luma$titleScreen(Screen screen) {
		return screen instanceof TitleScreen ? new LumaTitleScreen() : screen;
	}
}
