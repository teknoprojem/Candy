using UnityEngine;
using UnityEngine.InputSystem;
using System.Collections.Generic;
using System.Linq;

public class BoardManager : MonoBehaviour
{
    [SerializeField] private int xSize;
    [SerializeField] private int ySize;
    [SerializeField] private float offset;

    [SerializeField] private float swipeResist = 0.5f;

    [SerializeField] private float settleDelay = 0.05f;
    [SerializeField] private float afterClearDelay = 0.1f;
    [SerializeField] private float afterFallDelay = 0.05f;

    [SerializeField] private GameObject[] candyPrefabs;
    [SerializeField] private GameObject[] stripedCandyPrefabs;
    [SerializeField] private GameObject[] wrappedCandyPrefabs;
    [SerializeField] private GameObject colorBombPrefab; // YENİ: Renk Bombası / Nükleer Roket

    [Header("Game Settings")]
    public int maxMoves = 20;
    public int scorePerCandy = 10;
    private int currentScore = 0;
    private int remainingMoves;
    private bool isGameOver = false;
    private bool isGameStarting = true;
    private bool isSwapping = false;

    public GameObject[,] allCandies;

    private Candy selectedCandy;
    private Vector2 dragStartWorld;
    private bool isDragging;

    private bool inputLocked;

    public int XSize => xSize;
    public int YSize => ySize;

    public Vector2 GetWorldPosition(int x, int y)
    {
        return new Vector2(x + (x * offset), y + (y * offset));
    }

    private void Start()
    {
        remainingMoves = maxMoves;
        UpdateUI();
        allCandies = new GameObject[xSize, ySize];

        // Akıllı başlangıç: ilk kurulumda hazır eşleşme (3+) oluşturma
        for (int x = 0; x < xSize; x++)
        {
            for (int y = 0; y < ySize; y++)
            {
                Vector2 position = GetWorldPosition(x, y);

                int randomIndex = GetRandomCandyIdForStart(x, y);
                GameObject prefab = candyPrefabs[randomIndex];
                GameObject candy = Instantiate(prefab, position, Quaternion.identity);
                candy.transform.SetParent(transform);
                allCandies[x, y] = candy;

                Candy candyComponent = candy.GetComponent<Candy>();
                if (candyComponent == null)
                {
                    candyComponent = candy.AddComponent<Candy>();
                }

                candyComponent.x = x;
                candyComponent.y = y;
                candyComponent.candyId = randomIndex;
                candyComponent.candyID = randomIndex;
                candyComponent.candyType = (Candy.CandyType)randomIndex;
                candyComponent.board = this;
                candyComponent.isStripedInternal = false;
                candyComponent.SetTargetPosition(position);
            }
        }
    }

    private int GetRandomCandyIdForStart(int x, int y)
    {
        int maxTries = 100;
        int tries = 0;
        int id;

        do
        {
            id = Random.Range(0, candyPrefabs.Length);
            tries++;
        }
        while (WouldCreateMatchAtStart(x, y, id) && tries < maxTries);

        return id;
    }

    private bool WouldCreateMatchAtStart(int x, int y, int candidateId)
    {
        // Solda 2 aynı renk kontrolü
        if (x >= 2)
        {
            GameObject left1 = allCandies[x - 1, y];
            GameObject left2 = allCandies[x - 2, y];
            if (left1 != null && left2 != null)
            {
                Candy c1 = left1.GetComponent<Candy>();
                Candy c2 = left2.GetComponent<Candy>();
                if (c1 != null && c2 != null &&
                    c1.candyId == candidateId && c2.candyId == candidateId)
                {
                    return true;
                }
            }
        }

        // Aşağıda 2 aynı renk kontrolü
        if (y >= 2)
        {
            GameObject down1 = allCandies[x, y - 1];
            GameObject down2 = allCandies[x, y - 2];
            if (down1 != null && down2 != null)
            {
                Candy c1 = down1.GetComponent<Candy>();
                Candy c2 = down2.GetComponent<Candy>();
                if (c1 != null && c2 != null &&
                    c1.candyId == candidateId && c2.candyId == candidateId)
                {
                    return true;
                }
            }
        }

        return false;
    }

    private void Update()
    {
        if (inputLocked || Camera.main == null || Mouse.current == null) return;

        if (Mouse.current.leftButton.wasPressedThisFrame)
        {
            TrySelectCandyUnderMouse();
        }

        if (isDragging && selectedCandy != null)
        {
            DragSelectedCandyToMouse();

            if (Mouse.current.leftButton.wasReleasedThisFrame)
            {
                ReleaseSelectedCandy();
            }
        }
    }

    private void TrySelectCandyUnderMouse()
    {
        Vector2 world = GetMouseWorld2D();
        Collider2D hit = Physics2D.OverlapPoint(world);
        if (hit == null) return;

        Candy candy = hit.GetComponent<Candy>();
        if (candy == null) return;

        selectedCandy = candy;
        dragStartWorld = world;
        isDragging = true;
    }

    private void DragSelectedCandyToMouse()
    {
        Vector2 world = GetMouseWorld2D();
        selectedCandy.transform.position = new Vector3(world.x, world.y, selectedCandy.transform.position.z);
    }

    private void ReleaseSelectedCandy()
    {
        Vector2 dragEndWorld = GetMouseWorld2D();
        Vector2 delta = dragEndWorld - dragStartWorld;

        if (delta.magnitude >= swipeResist)
        {
            Vector2Int dir = GetSwipeDirection(delta);
            StartCoroutine(TrySwapAndResolveCoroutine(selectedCandy, dir));
        }

        if (delta.magnitude < swipeResist && selectedCandy != null)
        {
            Vector2 snap = GetWorldPosition(selectedCandy.x, selectedCandy.y);
            selectedCandy.SetTargetPosition(snap);
        }

        selectedCandy = null;
        isDragging = false;
    }

    private Vector2 GetMouseWorld2D()
    {
        Vector2 mousePos = Mouse.current.position.ReadValue();
        Vector3 screen = new Vector3(mousePos.x, mousePos.y, 0f);
        screen.z = -Camera.main.transform.position.z;
        Vector3 world = Camera.main.ScreenToWorldPoint(screen);
        return new Vector2(world.x, world.y);
    }

    private static Vector2Int GetSwipeDirection(Vector2 delta)
    {
        if (Mathf.Abs(delta.x) > Mathf.Abs(delta.y))
        {
            return delta.x > 0 ? Vector2Int.right : Vector2Int.left;
        }
        return delta.y > 0 ? Vector2Int.up : Vector2Int.down;
    }

    public bool TrySwap(Candy candy1, Candy candy2)
    {
        if (isGameOver || candy1 == null || candy2 == null) return false;

        int targetX = candy2.x;
        int targetY = candy2.y;

        if (targetX < 0 || targetX >= xSize || targetY < 0 || targetY >= ySize) return false;

        SwapCandies(candy1, candy2);
        return true;
    }

    private void SwapCandies(Candy a, Candy b)
    {
        int aX = a.x; int aY = a.y;
        int bX = b.x; int bY = b.y;

        GameObject aObj = a.gameObject;
        GameObject bObj = b.gameObject;

        allCandies[aX, aY] = bObj;
        allCandies[bX, bY] = aObj;

        a.x = bX; a.y = bY;
        b.x = aX; b.y = aY;

        Vector2 aTarget = GetWorldPosition(a.x, a.y);
        Vector2 bTarget = GetWorldPosition(b.x, b.y);
        a.SetTargetPosition(aTarget);
        b.SetTargetPosition(bTarget);
    }

    public System.Collections.IEnumerator TrySwapAndResolveCoroutine(Candy candy, Vector2Int dir)
    {
        if (inputLocked) yield break;

        int targetX = candy.x + dir.x;
        int targetY = candy.y + dir.y;
        
        if (targetX < 0 || targetX >= xSize || targetY < 0 || targetY >= ySize) yield break;

        Candy targetCandy = GetCandyComponent(targetX, targetY);
        if (targetCandy == null) yield break;

        inputLocked = true;
        isSwapping = true; 

        TrySwap(candy, targetCandy);
        yield return WaitForBoardToSettle();
        
        // Özel + özel swap: iki farklı özel taş → süper patlama hissi (sarsıntı + ekstra puan)
        int specialTypeA = GetSpecialCandyType(candy);
        int specialTypeB = GetSpecialCandyType(targetCandy);
        if (specialTypeA != 0 && specialTypeB != 0 && specialTypeA != specialTypeB)
        {
            ScreenShake(0.4f, 0.7f);
            currentScore += 250;
            UpdateUI();
            yield return new WaitForSeconds(0.15f);
        }
        
        // Renk Bombası / Nükleer Roket: Herhangi bir taşla eşleşince tüm tahta patlar (8x8 tam patlama)
        if (candy != null && targetCandy != null && (candy.isColorBomb || targetCandy.isColorBomb))
        {
            yield return StartCoroutine(ExplodeAllCandies());
            remainingMoves--;
            UpdateUI();
            if (remainingMoves <= 0) GameOver();
            inputLocked = false;
            isSwapping = false;
            yield break;
        }
        
        // Normal eşleşme kontrolü
        if (HasAnyMatch())
        {
            yield return ResolveBoardCoroutine();
        }
        else
        {
            Debug.Log("No match found, swapping back");
            TrySwap(candy, targetCandy);
            yield return WaitForBoardToSettle();
        }
        
        // Hamle sayacı: tüm patlamalar/zincirlemeler bittikten SONRA düşür
        remainingMoves--;
        UpdateUI();
        if (remainingMoves <= 0) GameOver();
        inputLocked = false;
        isSwapping = false; 
    }

    private System.Collections.IEnumerator ExplodeColorBomb(Candy colorBomb, Candy targetCandy)
    {
        if (colorBomb == null || targetCandy == null) yield break;
        
        Debug.Log($"Color Bomb exploded! Target color: {targetCandy.candyType}");
        
        // Patlatılacak rengi belirle
        Candy.CandyType targetColor = targetCandy.candyType;
        var candiesToDestroy = new List<GameObject>();
        
        // Tüm tahtada aynı renkli şekerleri bul
        for (int x = 0; x < xSize; x++)
        {
            for (int y = 0; y < ySize; y++)
            {
                GameObject candyObj = allCandies[x, y];
                if (candyObj != null)
                {
                    Candy candy = candyObj.GetComponent<Candy>();
                    if (candy != null && candy.candyType == targetColor)
                    {
                        candiesToDestroy.Add(candyObj);
                    }
                }
            }
        }
        
        // Renk bombasını da yok et
        if (colorBomb.gameObject != null)
        {
            candiesToDestroy.Add(colorBomb.gameObject);
        }
        
        ScreenShake(0.5f, 0.8f); // Büyük patlama efekti
        
        // Tüm şekerleri patlat
        foreach (var candy in candiesToDestroy)
        {
            if (candy != null)
            {
                Candy candyComponent = candy.GetComponent<Candy>();
                if (candyComponent != null && candyComponent.x >= 0 && candyComponent.x < xSize && 
                    candyComponent.y >= 0 && candyComponent.y < ySize)
                {
                    if (allCandies[candyComponent.x, candyComponent.y] == candy)
                    {
                        allCandies[candyComponent.x, candyComponent.y] = null;
                    }
                }
                
                CreateModernExplosion(candy);
            }
        }
        
        // Puan ekle
        currentScore += candiesToDestroy.Count * scorePerCandy * 3; // Bonus puan
        UpdateUI();
        
        yield return new WaitForSeconds(0.3f);
        
        // Tahtayı yeniden düzenle
        ShiftDown();
        yield return WaitForBoardToSettle();
        
        RefillBoard();
        yield return WaitForBoardToSettle();
        
        yield return StartCoroutine(ResolveBoardCoroutine());
    }
    
    private System.Collections.IEnumerator ExplodeAllCandies()
    {
        Debug.Log("Nuclear explosion! All candies destroyed!");
        
        var allCandiesList = new List<GameObject>();
        
        // Tüm şekerleri topla
        for (int x = 0; x < xSize; x++)
        {
            for (int y = 0; y < ySize; y++)
            {
                GameObject candyObj = allCandies[x, y];
                if (candyObj != null)
                {
                    allCandiesList.Add(candyObj);
                    allCandies[x, y] = null;
                }
            }
        }
        
        ScreenShake(1.0f, 1.5f); // En büyük patlama efekti
        
        // Tüm şekerleri patlat
        foreach (var candy in allCandiesList)
        {
            if (candy != null)
            {
                CreateModernExplosion(candy);
            }
        }
        
        // Maksimum puan
        currentScore += allCandiesList.Count * scorePerCandy * 5; // Süper bonus
        UpdateUI();
        
        yield return new WaitForSeconds(0.5f);
        
        // Tahtayı yeniden doldur
        RefillBoard();
        yield return WaitForBoardToSettle();
        
        yield return StartCoroutine(ResolveBoardCoroutine());
    }

    private System.Collections.IEnumerator ResolveBoardCoroutine()
    {
        inputLocked = true;
        int safety = 0;
        
        while (safety < 100)
        {
            safety++;
            bool specialCandyCreated;
            var matches = FindMatches(out specialCandyCreated);
            bool hasEmpty = HasAnyEmptyCell();
            if (matches.Count == 0 && !specialCandyCreated && !hasEmpty) break;

            if (matches.Count > 0)
            {
                ClearMatches(matches);
                yield return new WaitForSeconds(afterClearDelay);
            }

            ShiftDown();
            yield return WaitForBoardToSettle();
            yield return new WaitForSeconds(afterFallDelay);

            RefillBoard();
            yield return WaitForBoardToSettle();
        }

        isGameStarting = false;
        Debug.Log("Game setup completed - isGameStarting set to false");
        inputLocked = false;
    }

    private System.Collections.IEnumerator WaitForBoardToSettle()
    {
        bool anyMoving = true;
        while (anyMoving)
        {
            anyMoving = false;
            for (int x = 0; x < xSize; x++)
            {
                for (int y = 0; y < ySize; y++)
                {
                    GameObject obj = allCandies[x, y];
                    if (obj == null) continue;

                    Candy c = obj.GetComponent<Candy>();
                    if (c != null && c.IsMoving())
                    {
                        anyMoving = true;
                        break;
                    }
                }
                if (anyMoving) break;
            }
            if (anyMoving) yield return null;
        }

        if (settleDelay > 0f) yield return new WaitForSeconds(settleDelay);
    }

    private bool HasAnyMatch()
    {
        for (int x = 0; x < xSize; x++)
        {
            for (int y = 0; y < ySize; y++)
            {
                if (allCandies[x, y] != null)
                {
                    if (GetHorizontalMatchAt(x, y).Count >= 3) return true;
                    if (GetVerticalMatchAt(x, y).Count >= 3) return true;
                }
            }
        }
        return false;
    }

    private bool HasAnyEmptyCell()
    {
        for (int x = 0; x < xSize; x++)
            for (int y = 0; y < ySize; y++)
                if (allCandies[x, y] == null) return true;
        return false;
    }

    private System.Collections.Generic.List<GameObject> FindMatches(out bool specialCandyCreated)
    {
        specialCandyCreated = false;
        var allMatches = new System.Collections.Generic.HashSet<GameObject>();
        var horizontalMatches = new System.Collections.Generic.List<System.Collections.Generic.List<GameObject>>();
        var verticalMatches = new System.Collections.Generic.List<System.Collections.Generic.List<GameObject>>();

        // 1. TÜM HORIZONTAL MATCHES'İ BUL (BENZERSİZ)
        for (int y = 0; y < ySize; y++)
        {
            for (int x = 0; x <= xSize - 3; x++)
            {
                var match = GetHorizontalMatchAt(x, y);
                if (match.Count >= 3)
                {
                    // BENZERSİZ KONTROL: Bu eşleşme zaten var mı?
                    bool isDuplicate = false;
                    foreach (var existingMatch in horizontalMatches)
                    {
                        if (AreMatchesEqual(match, existingMatch))
                        {
                            isDuplicate = true;
                            break;
                        }
                    }
                    
                    if (!isDuplicate)
                    {
                        horizontalMatches.Add(match);
                        foreach (var candy in match)
                            allMatches.Add(candy);
                    }
                }
            }
        }

        // 2. TÜM VERTICAL MATCHES'İ BUL (BENZERSİZ)
        for (int x = 0; x < xSize; x++)
        {
            for (int y = 0; y <= ySize - 3; y++)
            {
                var match = GetVerticalMatchAt(x, y);
                if (match.Count >= 3)
                {
                    // BENZERSİZ KONTROL: Bu eşleşme zaten var mı?
                    bool isDuplicate = false;
                    foreach (var existingMatch in verticalMatches)
                    {
                        if (AreMatchesEqual(match, existingMatch))
                        {
                            isDuplicate = true;
                            break;
                        }
                    }
                    
                    if (!isDuplicate)
                    {
                        verticalMatches.Add(match);
                        foreach (var candy in match)
                            allMatches.Add(candy);
                    }
                }
            }
        }

        // 3. L/T KESİŞİMLERİNİ BUL (MATAMATİKSEL DOĞRULAMA)
        var intersectionPoints = FindIntersectionPoints(horizontalMatches, verticalMatches);
        
        // 4. ÖNCELİK SIRASI (kesin izole):
        //    1) Düz yatay/dikey tam 5 → Color Bomb (kesişim/L-T asla Color Bomb değil)
        //    2) L veya T kesişimi → Wrapped Candy
        //    3) Düz yatay/dikey 4'lü → Striped Candy
        //    4) Normal 3'lü temizle
        
        var fiveMatches = new System.Collections.Generic.List<System.Collections.Generic.List<GameObject>>();
        foreach (var match in horizontalMatches.Concat(verticalMatches))
        {
            if (match.Count == 5 && IsStraightLineMatch(match))
                fiveMatches.Add(match);
        }
        
        foreach (var fiveMatch in fiveMatches)
        {
            if (isGameStarting)
            {
                ReplaceMatchedCandies(fiveMatch);
            }
            else if (isSwapping)
            {
                CreateColorBomb(fiveMatch);
                specialCandyCreated = true;
                foreach (var candy in fiveMatch) 
                    allMatches.Remove(candy);
            }
            else
            {
                ReplaceMatchedCandies(fiveMatch);
            }
        }

        // 2. SONRA L/T KESİŞİMLERİ (Wrapped Candy)
        foreach (var intersection in intersectionPoints)
        {
            if (isGameStarting)
            {
                var intersectingCandy = allCandies[intersection.x, intersection.y];
                if (intersectingCandy != null)
                {
                    var candyList = new System.Collections.Generic.List<GameObject> { intersectingCandy };
                    ReplaceMatchedCandies(candyList);
                }
            }
            else if (isSwapping)
            {
                CreateWrappedCandyAt(intersection.x, intersection.y);
                specialCandyCreated = true;
                var intersectingCandy = allCandies[intersection.x, intersection.y];
                if (intersectingCandy != null)
                    allMatches.Remove(intersectingCandy);
            }
            else
            {
                var intersectingCandy = allCandies[intersection.x, intersection.y];
                if (intersectingCandy != null)
                {
                    var candyList = new System.Collections.Generic.List<GameObject> { intersectingCandy };
                    ReplaceMatchedCandies(candyList);
                }
            }
        }

        // 3. SONRA 4'lü HORIZONTAL/VERTICAL EŞLEŞMELER (Striped Candy)
        var fourMatches = new System.Collections.Generic.List<System.Collections.Generic.List<GameObject>>();
        foreach (var match in horizontalMatches.Concat(verticalMatches))
        {
            if (match.Count == 4)
                fourMatches.Add(match);
        }
        
        foreach (var fourMatch in fourMatches)
        {
            if (isGameStarting)
            {
                ReplaceMatchedCandies(fourMatch);
            }
            else if (isSwapping)
            {
                CreateStripedCandy(fourMatch);
                specialCandyCreated = true;
                foreach (var candy in fourMatch) 
                    allMatches.Remove(candy);
            }
            else
            {
                ReplaceMatchedCandies(fourMatch);
            }
        }

        // 4. SONRA 3'lü EŞLEŞMELER (Normal patlatma)
        // allMatches zaten 3'lü ve diğer eşleşmeleri içeriyor
        
        Debug.Log($"Matches found - 5-match: {fiveMatches.Count}, L/T: {intersectionPoints.Count}, 4-match: {fourMatches.Count}, 3-match: {allMatches.Count}");
        
        return new System.Collections.Generic.List<GameObject>(allMatches);
    }
    
    private bool AreMatchesEqual(System.Collections.Generic.List<GameObject> match1, System.Collections.Generic.List<GameObject> match2)
    {
        if (match1.Count != match2.Count) return false;
        
        var set1 = new System.Collections.Generic.HashSet<GameObject>(match1);
        var set2 = new System.Collections.Generic.HashSet<GameObject>(match2);
        
        return set1.SetEquals(set2);
    }
    
    /// <summary>
    /// Color Bomb yalnızca düz yatay veya dikey çizgi (tek satır / tek sütun) için üretilir.
    /// L/T kesişimleri asla true dönmez.
    /// </summary>
    private bool IsStraightLineMatch(System.Collections.Generic.List<GameObject> match)
    {
        if (match == null || match.Count < 5) return false;
        int firstX = -1, firstY = -1;
        bool allSameY = true, allSameX = true;
        foreach (var go in match)
        {
            if (go == null) return false;
            Candy c = go.GetComponent<Candy>();
            if (c == null) return false;
            if (firstX < 0)
            {
                firstX = c.x;
                firstY = c.y;
                continue;
            }
            if (c.y != firstY) allSameY = false;
            if (c.x != firstX) allSameX = false;
        }
        return firstX >= 0 && (allSameY || allSameX);
    }
    
    private System.Collections.Generic.List<Vector2Int> FindIntersectionPoints(
        System.Collections.Generic.List<System.Collections.Generic.List<GameObject>> horizontalMatches,
        System.Collections.Generic.List<System.Collections.Generic.List<GameObject>> verticalMatches)
    {
        var intersectionsSet = new System.Collections.Generic.HashSet<Vector2Int>();

        foreach (var hMatch in horizontalMatches)
        {
            if (hMatch.Count < 3) continue;
            var hSet = new System.Collections.Generic.HashSet<GameObject>();
            foreach (var go in hMatch)
            {
                if (go != null) hSet.Add(go);
            }

            foreach (var vMatch in verticalMatches)
            {
                if (vMatch.Count < 3) continue;
                foreach (var go in vMatch)
                {
                    if (go == null || !hSet.Contains(go)) continue;
                    Candy c = go.GetComponent<Candy>();
                    if (c != null && c.gameObject != null)
                    {
                        intersectionsSet.Add(new Vector2Int(c.x, c.y));
                    }
                }
            }
        }

        return new System.Collections.Generic.List<Vector2Int>(intersectionsSet);
    }
    
    private void ReplaceMatchedCandies(System.Collections.Generic.List<GameObject> candies)
    {
        foreach (var candy in candies)
        {
            if (candy == null) continue;
            
            Candy oldCandy = candy.GetComponent<Candy>();
            if (oldCandy != null && oldCandy.x >= 0 && oldCandy.x < xSize && oldCandy.y >= 0 && oldCandy.y < ySize)
            {
                Vector2 position = GetWorldPosition(oldCandy.x, oldCandy.y);
                int randomIndex = Random.Range(0, candyPrefabs.Length);
                
                // YENİ: AYNI ANDA grid'e atama
                GameObject newCandy = Instantiate(candyPrefabs[randomIndex], position, Quaternion.identity);
                newCandy.transform.SetParent(transform);
                
                // EN KRİTİK: Anında grid'e ata
                allCandies[oldCandy.x, oldCandy.y] = newCandy;
                
                Candy newCandyComponent = newCandy.GetComponent<Candy>();
                if (newCandyComponent == null) newCandyComponent = newCandy.AddComponent<Candy>();

                newCandyComponent.x = oldCandy.x;
                newCandyComponent.y = oldCandy.y;
                newCandyComponent.candyId = randomIndex;
                newCandyComponent.candyID = randomIndex;
                newCandyComponent.candyType = (Candy.CandyType)randomIndex;
                newCandyComponent.board = this;
                newCandyComponent.isStripedInternal = false;
                newCandyComponent.isWrapped = false;
                newCandyComponent.isColorBomb = false;
                newCandyComponent.SetTargetPosition(position);
                
                // Eski şekeri yok et
                Destroy(candy);
            }
        }
    }
    
    private void CreateWrappedCandyAt(int x, int y)
    {
        if (x < 0 || x >= xSize || y < 0 || y >= ySize) return;
        if (wrappedCandyPrefabs == null || wrappedCandyPrefabs.Length == 0) return;
        
        GameObject existingCandy = allCandies[x, y];
        if (existingCandy == null) return;
        
        Candy existingCandyComponent = existingCandy.GetComponent<Candy>();
        if (existingCandyComponent == null) return;
        
        Candy.CandyType candyType = existingCandyComponent.candyType;
        Vector2 targetPosition = GetWorldPosition(x, y);
        
        allCandies[x, y] = null;
        Destroy(existingCandy);
        
        GameObject wrappedCandyPrefab = null;
        switch (candyType)
        {
            case Candy.CandyType.Red: wrappedCandyPrefab = wrappedCandyPrefabs[0]; break;
            case Candy.CandyType.Blue: wrappedCandyPrefab = wrappedCandyPrefabs[1]; break;
            case Candy.CandyType.Green: wrappedCandyPrefab = wrappedCandyPrefabs[2]; break;
            case Candy.CandyType.Yellow: wrappedCandyPrefab = wrappedCandyPrefabs[3]; break;
            case Candy.CandyType.Magenta: wrappedCandyPrefab = wrappedCandyPrefabs[4]; break;
            case Candy.CandyType.Cyan: wrappedCandyPrefab = wrappedCandyPrefabs[5]; break;
            default: wrappedCandyPrefab = wrappedCandyPrefabs[0]; break;
        }
        
        if (wrappedCandyPrefab == null) return;
        
        Vector2 spawnPosition = new Vector2(targetPosition.x, targetPosition.y + 3f);
        GameObject wrappedCandy = Instantiate(wrappedCandyPrefab, spawnPosition, Quaternion.identity);
        wrappedCandy.transform.SetParent(transform);
        allCandies[x, y] = wrappedCandy;
        
        Candy wrappedCandyComponent = wrappedCandy.GetComponent<Candy>();
        if (wrappedCandyComponent == null) wrappedCandyComponent = wrappedCandy.AddComponent<Candy>();
        wrappedCandyComponent.x = x;
        wrappedCandyComponent.y = y;
        wrappedCandyComponent.candyId = (int)candyType;
        wrappedCandyComponent.candyID = (int)candyType;
        wrappedCandyComponent.candyType = candyType;
        wrappedCandyComponent.board = this;
        wrappedCandyComponent.isStripedInternal = false;
        wrappedCandyComponent.isColorBomb = false;
        wrappedCandyComponent.isWrapped = true;
        wrappedCandyComponent.SetTargetPosition(targetPosition);
        
        ScreenShake(0.2f, 0.3f);
    }
    
    private System.Collections.Generic.List<GameObject> GetHorizontalMatchAt(int startX, int startY)
    {
        var match = new System.Collections.Generic.List<GameObject>();
        
        GameObject start = allCandies[startX, startY];
        if (start == null) return match;
        
        Candy startCandy = start.GetComponent<Candy>();
        if (startCandy == null || startCandy.gameObject == null) return match;
        
        int id = startCandy.candyId;
        
        for (int x = startX; x >= 0; x--)
        {
            GameObject candy = allCandies[x, startY];
            if (candy == null) break;
            Candy c = candy.GetComponent<Candy>();
            if (c == null || c.gameObject == null) break;
            if (c.candyId != id) break;
            if (!match.Contains(candy))
                match.Add(candy);
        }
        
        for (int x = startX + 1; x < xSize; x++)
        {
            GameObject candy = allCandies[x, startY];
            if (candy == null) break;
            Candy c = candy.GetComponent<Candy>();
            if (c == null || c.gameObject == null) break;
            if (c.candyId != id) break;
            if (!match.Contains(candy))
                match.Add(candy);
        }
        
        return match;
    }
    
    private System.Collections.Generic.List<GameObject> GetVerticalMatchAt(int startX, int startY)
    {
        var match = new System.Collections.Generic.List<GameObject>();
        
        GameObject start = allCandies[startX, startY];
        if (start == null) return match;
        
        Candy startCandy = start.GetComponent<Candy>();
        if (startCandy == null || startCandy.gameObject == null) return match;
        
        int id = startCandy.candyId;
        
        for (int y = startY; y >= 0; y--)
        {
            GameObject candy = allCandies[startX, y];
            if (candy == null) break;
            Candy c = candy.GetComponent<Candy>();
            if (c == null || c.gameObject == null) break;
            if (c.candyId != id) break;
            if (!match.Contains(candy))
                match.Add(candy);
        }
        
        for (int y = startY + 1; y < ySize; y++)
        {
            GameObject candy = allCandies[startX, y];
            if (candy == null) break;
            Candy c = candy.GetComponent<Candy>();
            if (c == null || c.gameObject == null) break;
            if (c.candyId != id) break;
            if (!match.Contains(candy))
                match.Add(candy);
        }
        
        return match;
    }

    void CreateStripedCandy(System.Collections.Generic.List<GameObject> fourMatch)
    {
        if (fourMatch.Count != 4 || stripedCandyPrefabs == null || stripedCandyPrefabs.Length == 0) return;

        Candy firstCandy = fourMatch[0].GetComponent<Candy>();
        if (firstCandy == null) return;
            
        int candyID = firstCandy.candyID;
        
        // KESİN ÇÖZÜM: İlk şekerin koordinatlarını kullan (ortalama hesabı silindi)
        int centerX = firstCandy.x;
        int centerY = firstCandy.y;
        
        // ŞEKERLERİ YOK ET
        foreach (var candy in fourMatch)
        {
            Candy candyComponent = candy.GetComponent<Candy>();
            if (candyComponent != null && candyComponent.x >= 0 && candyComponent.x < xSize && candyComponent.y >= 0 && candyComponent.y < ySize)
            {
                if (allCandies[candyComponent.x, candyComponent.y] == candy)
                {
                    allCandies[candyComponent.x, candyComponent.y] = null;
                }
            }
            Destroy(candy.gameObject);
        }
        
        GameObject stripedCandyPrefab = stripedCandyPrefabs[candyID];
        if (stripedCandyPrefab == null) return;
        
        if (allCandies[centerX, centerY] != null)
        {
            Destroy(allCandies[centerX, centerY]);
            allCandies[centerX, centerY] = null;
        }
        Vector2 targetPosition = GetWorldPosition(centerX, centerY); 
        Vector2 spawnPosition = GetWorldPosition(centerX, centerY + 2); 
        GameObject stripedCandy = Instantiate(stripedCandyPrefab, spawnPosition, Quaternion.identity);
        stripedCandy.transform.SetParent(transform);
        allCandies[centerX, centerY] = stripedCandy;
        
        Candy stripedCandyComponent = stripedCandy.GetComponent<Candy>();
        if (stripedCandyComponent == null) stripedCandyComponent = stripedCandy.AddComponent<Candy>();
        
        stripedCandyComponent.x = centerX;
        stripedCandyComponent.y = centerY;
        stripedCandyComponent.candyId = firstCandy.candyId;
        stripedCandyComponent.candyID = candyID;
        stripedCandyComponent.candyType = firstCandy.candyType;
        stripedCandyComponent.board = this;
        stripedCandyComponent.isStripedInternal = true;
        stripedCandyComponent.isStriped = true; 
        
        stripedCandy.transform.position = spawnPosition;
        stripedCandyComponent.SetTargetPosition(targetPosition); 
        
        if (stripedCandy.GetComponent<Rigidbody2D>() == null)
        {
            Rigidbody2D rb = stripedCandy.AddComponent<Rigidbody2D>();
            rb.bodyType = RigidbodyType2D.Kinematic;
            rb.gravityScale = 0;
        }
        
        if (stripedCandy.GetComponent<Collider2D>() == null)
        {
            BoxCollider2D collider = stripedCandy.AddComponent<BoxCollider2D>();
            collider.isTrigger = true;
        }
        
        allCandies[centerX, centerY] = stripedCandy;
        StartCoroutine(WaitForStripedCandyToSettle(stripedCandyComponent));
    }

    void CreateColorBomb(System.Collections.Generic.List<GameObject> fiveMatch)
    {
        if (fiveMatch.Count != 5 || colorBombPrefab == null) return;

        Candy firstCandy = fiveMatch[0].GetComponent<Candy>();
        if (firstCandy == null) return;

        // KESİN ÇÖZÜM: İlk şekerin koordinatlarını kullan (ortalama hesabı silindi)
        int centerX = firstCandy.x;
        int centerY = firstCandy.y;
        
        Vector2 targetPosition = GetWorldPosition(centerX, centerY);
        
        // EN ÖNEMLİ: Önce 5'li eşleşmeyi tamamen temizle
        foreach (var candy in fiveMatch)
        {
            if (candy != null)
            {
                Candy candyComponent = candy.GetComponent<Candy>();
                if (candyComponent != null && candyComponent.x >= 0 && candyComponent.x < xSize && 
                    candyComponent.y >= 0 && candyComponent.y < ySize)
                {
                    // Grid'den kaldır
                    if (allCandies[candyComponent.x, candyComponent.y] == candy)
                    {
                        allCandies[candyComponent.x, candyComponent.y] = null;
                    }
                }
                // Hemen yok et
                Destroy(candy);
            }
        }
        
        if (allCandies[centerX, centerY] != null)
        {
            Destroy(allCandies[centerX, centerY]);
            allCandies[centerX, centerY] = null;
        }
        Vector2 spawnPosition = new Vector2(targetPosition.x, targetPosition.y + 3f);
        GameObject colorBomb = Instantiate(colorBombPrefab, spawnPosition, Quaternion.identity);
        colorBomb.transform.SetParent(transform);
        allCandies[centerX, centerY] = colorBomb;
        
        Candy colorBombComponent = colorBomb.GetComponent<Candy>();
        if (colorBombComponent == null) colorBombComponent = colorBomb.AddComponent<Candy>();
        colorBombComponent.x = centerX;
        colorBombComponent.y = centerY;
        colorBombComponent.candyId = -1;
        colorBombComponent.candyID = -1;
        colorBombComponent.board = this;
        colorBombComponent.isColorBomb = true;
        colorBombComponent.isStripedInternal = false;
        colorBombComponent.isWrapped = false;
        colorBombComponent.SetTargetPosition(targetPosition);
        
        // Debug için kontrol
        Debug.Log($"Color Bomb created at ({centerX}, {centerY}) - Grid assigned: {allCandies[centerX, centerY] != null}");
        
        ScreenShake(0.4f, 0.6f); // Daha büyük patlama efekti
        
        // Aşağı düşmeyi tetikle
        StartCoroutine(WaitForColorBombToSettle(colorBombComponent));
    }
    
    private System.Collections.IEnumerator WaitForColorBombToSettle(Candy colorBomb)
    {
        if (colorBomb == null) yield break;
        
        Vector2 targetPos = colorBomb.TargetPosition;
        
        // Şekerin hedef pozisyona ulaşmasını bekle
        while (colorBomb != null && colorBomb.gameObject != null && 
               Vector2.Distance(colorBomb.transform.position, targetPos) > 0.01f)
        {
            yield return null;
        }
        
        Debug.Log("Color Bomb settled successfully");
    }

    void CreateWrappedCandy(System.Collections.Generic.List<GameObject> matchList) // 5'li veya L/T şekli için
    {
        if (matchList.Count < 5 || wrappedCandyPrefabs == null || wrappedCandyPrefabs.Length == 0) return;

        Candy firstCandy = matchList[0].GetComponent<Candy>();
        if (firstCandy == null) return;
            
        Candy.CandyType candyType = firstCandy.candyType;
        
        // KESİN ÇÖZÜM: İlk şekerin koordinatlarını kullan (ortalama hesabı silindi)
        int centerX = firstCandy.x;
        int centerY = firstCandy.y;
        
        Vector2 targetPosition = GetWorldPosition(centerX, centerY);
        
        // EN ÖNEMLİ: Önce eşleşmeyi tamamen temizle
        foreach (var candy in matchList)
        {
            if (candy != null)
            {
                Candy candyComponent = candy.GetComponent<Candy>();
                if (candyComponent != null && candyComponent.x >= 0 && candyComponent.x < xSize && 
                    candyComponent.y >= 0 && candyComponent.y < ySize)
                {
                    // Grid'den kaldır
                    if (allCandies[candyComponent.x, candyComponent.y] == candy)
                    {
                        allCandies[candyComponent.x, candyComponent.y] = null;
                    }
                }
                // Hemen yok et
                Destroy(candy);
            }
        }
        
        GameObject wrappedCandyPrefab = null;
        switch (candyType)
        {
            case Candy.CandyType.Red: wrappedCandyPrefab = wrappedCandyPrefabs[0]; break;
            case Candy.CandyType.Blue: wrappedCandyPrefab = wrappedCandyPrefabs[1]; break;
            case Candy.CandyType.Green: wrappedCandyPrefab = wrappedCandyPrefabs[2]; break;
            case Candy.CandyType.Yellow: wrappedCandyPrefab = wrappedCandyPrefabs[3]; break;
            case Candy.CandyType.Magenta: wrappedCandyPrefab = wrappedCandyPrefabs[4]; break;
            case Candy.CandyType.Cyan: wrappedCandyPrefab = wrappedCandyPrefabs[5]; break;
            default: wrappedCandyPrefab = wrappedCandyPrefabs[0]; break;
        }
        
        if (wrappedCandyPrefab == null) return;
        
        if (allCandies[centerX, centerY] != null)
        {
            Destroy(allCandies[centerX, centerY]);
            allCandies[centerX, centerY] = null;
        }
        Vector2 spawnPosition = GetWorldPosition(centerX, centerY + 3);
        GameObject wrappedCandy = Instantiate(wrappedCandyPrefab, spawnPosition, Quaternion.identity);
        wrappedCandy.transform.SetParent(transform);
        allCandies[centerX, centerY] = wrappedCandy;
        
        Candy wrappedCandyComponent = wrappedCandy.GetComponent<Candy>();
        if (wrappedCandyComponent == null) wrappedCandyComponent = wrappedCandy.AddComponent<Candy>();
        wrappedCandyComponent.x = centerX;
        wrappedCandyComponent.y = centerY;
        wrappedCandyComponent.candyId = (int)candyType;
        wrappedCandyComponent.candyID = (int)candyType;
        wrappedCandyComponent.candyType = candyType;
        wrappedCandyComponent.board = this;
        wrappedCandyComponent.isStripedInternal = false;
        wrappedCandyComponent.isColorBomb = false;
        wrappedCandyComponent.isWrapped = true;
        wrappedCandyComponent.SetTargetPosition(targetPosition);
        
        ScreenShake(0.2f, 0.3f);
    }

    void CreateModernExplosion(GameObject candyObj)
    {
        if (candyObj == null) return;

        Candy candyComponent = candyObj.GetComponent<Candy>();
        if (candyComponent == null) return;

        Color explosionColor = GetModernColor(candyComponent.candyType);
        
        StartCoroutine(ScaleAndDestroyAnimation(candyObj, explosionColor));
        CreateGhostEffect(candyObj.transform.position, explosionColor);
    }

    Color GetModernColor(Candy.CandyType type)
    {
        switch (type)
        {
            case Candy.CandyType.Red: return new Color(1.0f, 0.2f, 0.2f, 1.0f); 
            case Candy.CandyType.Blue: return new Color(0.2f, 0.6f, 1.0f, 1.0f); 
            case Candy.CandyType.Yellow: return new Color(1.0f, 0.9f, 0.2f, 1.0f); 
            case Candy.CandyType.Green: return new Color(0.2f, 1.0f, 0.4f, 1.0f); 
            case Candy.CandyType.Magenta: return new Color(1.0f, 0.2f, 0.8f, 1.0f); 
            case Candy.CandyType.Cyan: return new Color(0.2f, 1.0f, 1.0f, 1.0f); 
            default: return Color.white;
        }
    }

    private System.Collections.IEnumerator ScaleAndDestroyAnimation(GameObject candyObj, Color explosionColor)
    {
        Vector3 originalScale = candyObj.transform.localScale;
        Vector3 glowScale = originalScale * 1.6f; 
        
        SpriteRenderer renderer = candyObj.GetComponent<SpriteRenderer>();
        Color originalColor = renderer.color;
        
        float elapsed = 0f;
        float growDuration = 0.08f; 
        
        while (elapsed < growDuration)
        {
            if (candyObj == null || candyObj.transform == null) yield break;
            
            float t = elapsed / growDuration;
            float easeT = EaseInBack(t);
            
            candyObj.transform.localScale = Vector3.Lerp(originalScale, glowScale, easeT);
            
            // Renderer null kontrolü
            if (renderer != null)
            {
                renderer.color = Color.Lerp(originalColor, explosionColor, easeT);
            }
            
            elapsed += Time.deltaTime;
            yield return null;
        }
        
        if (candyObj != null && candyObj.transform != null)
        {
            CameraShake.Instance?.Shake(0.2f, 0.3f); 
        }
        
        elapsed = 0f;
        float shrinkDuration = 0.1f;
        
        while (elapsed < shrinkDuration)
        {
            if (candyObj == null || candyObj.transform == null) yield break;
            
            float t = elapsed / shrinkDuration;
            
            candyObj.transform.localScale = Vector3.Lerp(glowScale, Vector3.zero, t);
            
            // Renderer null kontrolü
            if (renderer != null)
            {
                Color fadeColor = renderer.color;
                fadeColor.a = Mathf.Lerp(1f, 0f, t);
                renderer.color = fadeColor;
            }
            
            elapsed += Time.deltaTime;
            yield return null;
        }
        
        if (candyObj != null) Destroy(candyObj);
    }

    private float EaseInBack(float t)
    {
        float c1 = 1.70158f;
        float c3 = c1 + 1f;
        return c3 * t * t * t - c1 * t * t;
    }

    void CreateGhostEffect(Vector3 position, Color color)
    {
        GameObject ghost = new GameObject("GhostEffect");
        ghost.transform.position = position;
        
        SpriteRenderer ghostRenderer = ghost.AddComponent<SpriteRenderer>();
        ghostRenderer.sprite = CreateGhostSprite();
        ghostRenderer.color = new Color(color.r, color.g, color.b, 0.6f); 
        ghostRenderer.sortingOrder = 50;
        
        StartCoroutine(GhostFadeAnimation(ghost));
    }

    private System.Collections.IEnumerator GhostFadeAnimation(GameObject ghost)
    {
        SpriteRenderer renderer = ghost.GetComponent<SpriteRenderer>();
        Vector3 startScale = Vector3.one * 0.8f;
        Vector3 endScale = Vector3.one * 1.5f;
        
        ghost.transform.localScale = startScale;
        
        float elapsed = 0f;
        float duration = 0.6f;
        
        while (elapsed < duration)
        {
            float t = elapsed / duration;
            
            ghost.transform.localScale = Vector3.Lerp(startScale, endScale, t);
            
            Color color = renderer.color;
            color.a = Mathf.Lerp(0.6f, 0f, t);
            renderer.color = color;
            
            elapsed += Time.deltaTime;
            yield return null;
        }
        
        Destroy(ghost);
    }

    private Sprite CreateGhostSprite()
    {
        int size = 64;
        Texture2D texture = new Texture2D(size, size);
        Color[] pixels = new Color[size * size];
        
        Vector2 center = new Vector2(size / 2f, size / 2f);
        float maxRadius = size / 2f - 2f;
        
        for (int y = 0; y < size; y++)
        {
            for (int x = 0; x < size; x++)
            {
                float distance = Vector2.Distance(new Vector2(x, y), center);
                
                if (distance <= maxRadius)
                {
                    float alpha = 1f - (distance / maxRadius);
                    alpha = alpha * alpha; 
                    pixels[y * size + x] = new Color(1f, 1f, 1f, alpha);
                }
                else
                {
                    pixels[y * size + x] = Color.clear;
                }
            }
        }
        
        texture.SetPixels(pixels);
        texture.Apply();
        
        return Sprite.Create(texture, new Rect(0, 0, size, size), new Vector2(0.5f, 0.5f));
    }

    public void ExplodeWrappedCandy(int centerX, int centerY)
    {
        var candiesToDestroy = new List<GameObject>();
        var additionalWrappedCandies = new List<Candy>();
        
        // 3x3 alanı kontrol et (zincirleme wrapped'lar ilk geçişte yok edilmez, referansla gecikmeli tetiklenir)
        for (int x = centerX - 1; x <= centerX + 1; x++)
        {
            for (int y = centerY - 1; y <= centerY + 1; y++)
            {
                if (x >= 0 && x < xSize && y >= 0 && y < ySize)
                {
                    GameObject candy = allCandies[x, y];
                    if (candy != null)
                    {
                        Candy candyComponent = candy.GetComponent<Candy>();
                        if (candyComponent != null && candyComponent.isWrapped && 
                            !(x == centerX && y == centerY))
                        {
                            additionalWrappedCandies.Add(candyComponent);
                            continue;
                        }
                        candiesToDestroy.Add(candy);
                    }
                }
            }
        }
        
        ScreenShake(0.3f, 0.5f);
        
        // Önce tüm şekerleri yok et (zincirleme wrapped'lar hariç)
        foreach (var candy in candiesToDestroy)
        {
            if (candy == null) continue; // Null kontrolü
            
            Candy candyComponent = candy.GetComponent<Candy>();
            if (candyComponent != null)
            {
                // Grid'den kaldır
                if (candyComponent.x >= 0 && candyComponent.x < xSize && 
                    candyComponent.y >= 0 && candyComponent.y < ySize)
                {
                    if (allCandies[candyComponent.x, candyComponent.y] == candy)
                    {
                        allCandies[candyComponent.x, candyComponent.y] = null;
                    }
                }
                
                // Patlama efekti
                CreateModernExplosion(candy);
            }
        }
        
        // Zincirleme patlamalar - hedef referansı ile gecikmeli tetikle (koordinat kayması olmasın)
        foreach (var wrappedCandy in additionalWrappedCandies)
        {
            if (wrappedCandy != null)
                StartCoroutine(DelayedWrappedExplosion(wrappedCandy, 0.1f));
        }
    }
    
    private System.Collections.IEnumerator DelayedWrappedExplosion(Candy wrappedCandy, float delay)
    {
        yield return new WaitForSeconds(delay);
        if (wrappedCandy == null || wrappedCandy.gameObject == null) yield break;
        ExplodeWrappedCandy(wrappedCandy.x, wrappedCandy.y);
    }

    public void ScreenShake(float duration = 0.1f, float magnitude = 0.1f)
    {
        StartCoroutine(ScreenShakeCoroutine(duration, magnitude));
    }

    private System.Collections.IEnumerator ScreenShakeCoroutine(float duration, float magnitude)
    {
        Vector3 originalPosition = Camera.main.transform.position;
        float elapsed = 0f;

        while (elapsed < duration)
        {
            float x = Random.Range(-1f, 1f) * magnitude;
            float y = Random.Range(-1f, 1f) * magnitude;

            Camera.main.transform.position = originalPosition + new Vector3(x, y, 0);
            elapsed += Time.deltaTime;

            yield return null;
        }

        Camera.main.transform.position = originalPosition;
    }

    private System.Collections.IEnumerator WaitForStripedCandyToSettle(Candy stripedCandy)
    {
        // Null kontrolü - şeker zaten yok edilmiş olabilir
        if (stripedCandy == null || stripedCandy.gameObject == null)
        {
            yield break;
        }
        
        Vector2 targetPos = stripedCandy.TargetPosition; 
        while (stripedCandy != null && stripedCandy.gameObject != null && 
               Vector2.Distance(stripedCandy.transform.position, targetPos) > 0.01f)
        {
            yield return null; 
        }
        
        // Tekrar kontrol et - döngü sırasında yok edilmiş olabilir
        if (stripedCandy == null || stripedCandy.gameObject == null)
        {
            yield break;
        }
        
        yield return new WaitForSeconds(0.1f);
        
        // ÇÖZÜM 2: Çifte yerçekimi çağrıları silindi
        // Ana döngü (ResolveBoardCoroutine) bu işlemleri zaten yapıyor
        // ShiftDown();
        // yield return WaitForBoardToSettle();
        // RefillBoard();
        // yield return WaitForBoardToSettle();
    }

    private Candy GetCandyComponent(int x, int y)
    {
        if (x < 0 || x >= xSize || y < 0 || y >= ySize) return null;
        GameObject obj = allCandies[x, y];
        return obj != null ? obj.GetComponent<Candy>() : null;
    }
    
    /// <summary>Özel taş türü: 0 = normal, 1 = çizgili, 2 = bomba (wrapped), 3 = renk bombası.</summary>
    private static int GetSpecialCandyType(Candy c)
    {
        if (c == null) return 0;
        if (c.isColorBomb) return 3;
        if (c.isWrapped) return 2;
        if (c.isStripedInternal) return 1;
        return 0;
    }
    
    public Candy GetCandyAt(int x, int y)
    {
        if (x < 0 || x >= xSize || y < 0 || y >= ySize) return null;
        GameObject obj = allCandies[x, y];
        return obj != null ? obj.GetComponent<Candy>() : null;
    }

    private void UpdateUI()
    {
        if (UIManager.Instance != null)
        {
            UIManager.Instance.UpdateScore(currentScore);
            UIManager.Instance.UpdateMoves(remainingMoves);
        }
    }

    public void RunResolveBoard()
    {
        StartCoroutine(ResolveBoardCoroutine());
    }

    private void GameOver()
    {
        isGameOver = true;
        if (UIManager.Instance != null)
        {
            UIManager.Instance.ShowGameOver(currentScore);
        }
    }

    void ClearMatches(List<GameObject> matches)
    {
        if (matches == null || matches.Count == 0) return;
        
        // Nadir durum: 3 renk bombası YAN YANA eşleşmişse (yatay/dikey 3'lü) → rastgele 1-2 rengi sil.
        // Normal renk bombası: herhangi bir taşla swap → TrySwapAndResolveCoroutine içinde 8x8 tam patlama (ExplodeAllCandies) zaten tetikleniyor.
        int colorBombCount = 0;
        foreach (GameObject m in matches)
        {
            if (m == null) continue;
            Candy c = m.GetComponent<Candy>();
            if (c != null && c.isColorBomb) colorBombCount++;
        }
        if (colorBombCount >= 3)
        {
            ExplodeRandomColorsFromBoard(Random.Range(1, 3));
            ScreenShake(0.5f, 0.8f);
        }
        
        int comboMultiplier = 1 + (matches.Count / 3);
        int pointsEarned = matches.Count * scorePerCandy * comboMultiplier;
        currentScore += pointsEarned;
        
        UpdateUI();
        
        if (matches.Count >= 4) ScreenShake(0.15f, 0.2f); 
        else if (matches.Count >= 3) ScreenShake(0.1f, 0.1f); 
        
        foreach (GameObject match in matches)
        {
            if (match == null) continue;

            Candy candy = match.GetComponent<Candy>();
            if (candy != null && candy.x >= 0 && candy.x < xSize && candy.y >= 0 && candy.y < ySize)
            {
                if (candy.isStripedInternal)
                {
                    if (allCandies[candy.x, candy.y] == match)
                        allCandies[candy.x, candy.y] = null;
                    candy.DestroyCandy();
                }
                else if (candy.isWrapped)
                {
                    ExplodeWrappedCandy(candy.x, candy.y);
                }
                else
                {
                    if (allCandies[candy.x, candy.y] == match)
                        allCandies[candy.x, candy.y] = null;
                    CreateModernExplosion(match);
                }
            }
            else
            {
                if (match != null)
                {
                    Destroy(match);
                }
            }
        }
    }
    
    /// <summary>3+ renk bombası eşleşince: tahtadan rastgele 1 veya 2 rengin tüm taşlarını yok eder.</summary>
    private void ExplodeRandomColorsFromBoard(int numColors)
    {
        var allTypes = new List<Candy.CandyType>
        {
            Candy.CandyType.Red, Candy.CandyType.Green, Candy.CandyType.Blue,
            Candy.CandyType.Yellow, Candy.CandyType.Magenta, Candy.CandyType.Cyan
        };
        for (int i = 0; i < numColors && allTypes.Count > 0; i++)
        {
            int idx = Random.Range(0, allTypes.Count);
            Candy.CandyType chosen = allTypes[idx];
            allTypes.RemoveAt(idx);
            for (int x = 0; x < xSize; x++)
            {
                for (int y = 0; y < ySize; y++)
                {
                    GameObject obj = allCandies[x, y];
                    if (obj == null) continue;
                    Candy c = obj.GetComponent<Candy>();
                    if (c == null || c.candyType != chosen) continue;
                    if (allCandies[x, y] == obj)
                        allCandies[x, y] = null;
                    CreateModernExplosion(obj);
                }
            }
        }
        currentScore += (xSize * ySize) * scorePerCandy * 2;
        UpdateUI();
    }
    
    public void ClearRow(int row)
    {
        if (row < 0 || row >= ySize) return;
            
        ScreenShake(0.2f, 0.3f); 
            
        var stripedCandiesInRow = new System.Collections.Generic.List<Candy>();
            
        for (int x = 0; x < xSize; x++)
        {
            GameObject candyObj = allCandies[x, row];
            if (candyObj != null)
            {
                Candy candy = candyObj.GetComponent<Candy>();
                if (candy != null && candy.isStripedInternal)
                {
                    stripedCandiesInRow.Add(candy);
                }
            }
        }
        
        for (int x = 0; x < xSize; x++)
        {
            GameObject candyObj = allCandies[x, row];
            if (candyObj != null)
            {
                Candy candy = candyObj.GetComponent<Candy>();
                if (candy != null)
                {
                    allCandies[x, row] = null;
                    Destroy(candyObj);
                }
            }
        }
        
        currentScore += xSize * scorePerCandy * 2; 
        UpdateUI();
    }

    void ShiftDown()
    {
        for (int x = 0; x < xSize; x++)
        {
            int emptyCount = 0;
            for (int y = 0; y < ySize; y++)
            {
                if (allCandies[x, y] == null)
                {
                    emptyCount++;
                    continue;
                }

                if (emptyCount > 0)
                {
                    GameObject candyObj = allCandies[x, y];
                    allCandies[x, y] = null;
                    allCandies[x, y - emptyCount] = candyObj;

                    Candy candy = candyObj.GetComponent<Candy>();
                    if (candy != null)
                    {
                        candy.x = x;
                        candy.y = y - emptyCount;
                        candy.SetTargetPosition(GetWorldPosition(x, y - emptyCount));
                    }
                }
            }
        }
    }

    void RefillBoard()
    {
        for (int x = 0; x < xSize; x++)
        {
            for (int y = 0; y < ySize; y++)
            {
                if (allCandies[x, y] != null) continue;

                Vector2 target = GetWorldPosition(x, y);
                int randomIndex = Random.Range(0, candyPrefabs.Length);
                GameObject candy = Instantiate(candyPrefabs[randomIndex], target, Quaternion.identity);
                candy.transform.SetParent(transform);
                
                if (allCandies[x, y] != null)
                {
                    Destroy(allCandies[x, y]);
                    allCandies[x, y] = null;
                }
                allCandies[x, y] = candy;

                Candy candyComponent = candy.GetComponent<Candy>();
                if (candyComponent == null) candyComponent = candy.AddComponent<Candy>();

                candyComponent.x = x;
                candyComponent.y = y;
                candyComponent.candyId = randomIndex;
                candyComponent.candyID = randomIndex; 
                candyComponent.candyType = (Candy.CandyType)randomIndex;
                candyComponent.board = this;
                candyComponent.isStripedInternal = false; 

                candy.transform.position = new Vector3(target.x, target.y + 2f, candy.transform.position.z);
                candyComponent.SetTargetPosition(target);
                
                Debug.Log($"New candy created at ({x}, {y}) - Grid assigned: {allCandies[x, y] != null}");
            }
        }
    }
}
