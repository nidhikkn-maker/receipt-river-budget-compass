import { Toaster as Sonner } from "sonner";
import { useToastPlacement } from "@/lib/toast-placement";
import { useAppLocked } from "@/lib/app-lock-state";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  // While a sheet with a sticky footer is open (Smart Add), toasts move to the top so they never cover its actions.
  const placement = useToastPlacement();
  // While the app is locked no notification is shown or kept (UIX §16.4); the lock dismisses the ones on screen.
  const locked = useAppLocked();
  if (locked) return null;
  return (
    <Sonner
      className="toaster group"
      position={placement.position}
      offset={placement.offset}
      mobileOffset={placement.mobileOffset}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
