import toast from 'react-hot-toast';

interface SmartToastAction {
    label: string;
    onClick?: () => void;
    href?: string;
}

interface SmartToastOptions {
    action?: SmartToastAction;
    duration?: number;
}

export function showSmartToast(
    message: string,
    router: any, // Using any since Next.js router type varies
    options?: SmartToastOptions
) {
    const { action, duration = 5000 } = options || {};

    if (!action) {
        toast.success(message, { duration });
        return;
    }

    toast.success(
        (t) => (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                justifyContent: 'space-between'
            }}>
                <span>{message}</span>
                <button
                    onClick={() => {
                        toast.dismiss(t.id);
                        if (action.onClick) {
                            action.onClick();
                        } else if (action.href) {
                            router.push(action.href);
                        }
                    }}
                    style={{
                        padding: '0.5rem 1rem',
                        background: '#7c3aed',
                        border: 'none',
                        borderRadius: '0.5rem',
                        color: '#fff',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                    }}
                >
                    {action.label}
                </button>
            </div>
        ),
        {
            duration,
            style: {
                minWidth: '400px'
            }
        }
    );
}
