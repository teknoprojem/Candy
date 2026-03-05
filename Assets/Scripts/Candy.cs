using UnityEngine;
using UnityEngine.InputSystem;

public class Candy : MonoBehaviour
{
    // YENİ: Şeker Türü Enum'u
    public enum CandyType
    {
        Red,
        Green,
        Blue,
        Yellow,
        Magenta,
        Cyan
    }

    public int candyID; // Hangi renk olduğunu anlamamız için
    public bool isStriped; // Çizgili şeker olup olmadığını anlamamız için
    public CandyType candyType; // YENİ: Şeker türü
    public bool isWrapped; // YENİ: Bomba şeker (Wrapped Candy) olup olmadığı
    public bool isColorBomb; // YENİ: Renk Bombası / Nükleer Roket
    
    [HideInInspector] public int x;
    [HideInInspector] public int y;
    [HideInInspector] public int candyId;
    [HideInInspector] public BoardManager board;
    [HideInInspector] public bool isStripedInternal;

    // targetPosition'a erişim için public property
    public Vector2 TargetPosition => targetPosition;

    // Pulse efekti için Inspector'dan ayarlanabilir değişkenler
    [Header("Striped Candy Pulse Effect")]
    public float pulseSpeed = 4f; // Kalp atışı hızı (2 katına çıkarıldı)
    public float pulseAmount = 0.2f; // Büyüme miktarı (%20-%25 arası büyüme)
    
    private Vector3 originalScale; // Orijinal boyutu sakla

    private void Start()
    {
        // Orijinal boyutu sakla
        originalScale = transform.localScale;
    }

    // YENİ: Bomba Şeker (Wrapped Candy) patlama fonksiyonu
    public void ExplodeWrapped()
    {
        if (board != null)
        {
            Debug.Log($"Wrapped candy at ({x}, {y}) - 3x3 patlama!");
            board.ExplodeWrappedCandy(x, y);
        }
    }

    public void DestroyCandy()
    {
        if (isStripedInternal && board != null)
        {
            // Çizgili şeker ise sadece satırı yok et
            board.ClearRow(y);
            // board.ClearColumn(x); // Geçici olarak kapalı
            
            Debug.Log($"Striped candy destroyed at ({x}, {y}) - Cleared row {y}");
            
            // Kendini de grid'den kaldır
            if (board.allCandies[x, y] == gameObject)
            {
                board.allCandies[x, y] = null;
            }
            board.RunResolveBoard();
            Destroy(gameObject);
        }
        else if (isWrapped && board != null)
        {
            // YENİ: Bomba şeker ise 3x3 patlama
            ExplodeWrapped();
            
            // Kendini de grid'den kaldır
            if (board.allCandies[x, y] == gameObject)
            {
                board.allCandies[x, y] = null;
            }
            Destroy(gameObject);
        }
        else if (isColorBomb && board != null)
        {
            // YENİ: Renk Bombası / Nükleer Roket - DestroyCandy içinde kullanılmaz
            // Bu sadece swap sırasında tetiklenir
            Debug.Log($"ColorBomb at ({x}, {y}) - should be triggered by swap");
        }
        else
        {
            // Normal şeker ise sadece yok et
            if (board != null && board.allCandies[x, y] == gameObject)
            {
                board.allCandies[x, y] = null;
            }
            Destroy(gameObject);
        }
    }

    [SerializeField] private float moveSpeed = 8f;

    private Vector2 targetPosition;

    private void Update()
    {
        transform.position = Vector2.MoveTowards(transform.position, targetPosition, moveSpeed * Time.deltaTime);

        // Kalp atışı (nefes alma) efekti: Çizgili, Renk Bombası ve L/T (Wrapped) özel taşlar
        if (isStripedInternal || isColorBomb || isWrapped)
        {
            float pulse = Mathf.Sin(Time.time * pulseSpeed) * pulseAmount;
            Vector3 newScale = originalScale * (1f + pulse);
            transform.localScale = newScale;
        }
        else
        {
            transform.localScale = originalScale;
        }
    }

    private static Vector2Int GetSwipeDirection(float swipeAngle)
    {
        if (swipeAngle > -45f && swipeAngle <= 45f)
        {
            return Vector2Int.right;
        }

        if (swipeAngle > 45f && swipeAngle <= 135f)
        {
            return Vector2Int.up;
        }

        if (swipeAngle > 135f || swipeAngle <= -135f)
        {
            return Vector2Int.left;
        }

        return Vector2Int.down;
    }

    public void SetTargetPosition(Vector2 newTarget)
    {
        targetPosition = newTarget;
    }

    public bool IsMoving()
    {
        return Vector2.Distance(transform.position, targetPosition) > 0.01f;
    }

    private void Awake()
    {
        targetPosition = transform.position;
    }
}
